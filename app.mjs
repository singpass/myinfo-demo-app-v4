import express from "express";
import path from "path";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import cors from "cors";
import crypto from "crypto";
import MyInfoConnector from "myinfo-connector-v4-nodejs";
import fs from "fs";
import jose from "node-jose";
import { URL, URLSearchParams } from "url";
import axios from "axios";
import config from "./config/config.js";
import chalk from "chalk";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3001;
const connector = new MyInfoConnector(config.MYINFO_CONNECTOR_CONFIG);
const keysPath = __dirname + "/keys.json";

let sessionIdCache = {};

app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// storePrivateKeysToPEM(keysPath);

app.get("/createTrainee", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/jwks", async function (req, res) {
  let ks;
  try {
    ks = fs.readFileSync(keysPath);
  } catch (e) {
    ks = null;
  }

  let keyStore;
  if (!ks) {
    keyStore = jose.JWK.createKeyStore();

    await keyStore.generate("EC", "P-256", { use: "sig", alg: "ES256" });
    await keyStore.generate("EC", "P-256", {
      use: "enc",
      alg: "ECDH-ES+A256KW",
    });

    fs.writeFileSync(
      keysPath,
      JSON.stringify(keyStore.toJSON(true), null, "  ")
    );
  } else {
    keyStore = await jose.JWK.asKeyStore(ks.toString());
  }

  res.send(keyStore.toJSON());
});

app.get("/updateTadabaseTrainee", async (req, res) => {
  const traineeRecordId = req.query.traineeRecordId;
  const employerRecordId = req.query.employerRecordId;
  const redirectURL = req.query.redirectURL;

  const trainee = {
    traineeId: req.query.uinfin,
    name: req.query.name,
    traineeGender: mapSex(req.query.sex),
    race: mapRace(req.query.race),
    nationality: mapNationality(req.query.nationality),
    dateOfBirth: req.query.dob,
    email: req.query.email,
    tmpPhoneNumberContactNumber: req.query.mobileno,
    tmpContactTypeContactNumber: "3 - Mobile Number",
    registeredAddress: req.query.regadd,
    residentialStatus: req.query.residentialstatus,
    cpfEmployer: req.query.cpfemployers,
    recordId: traineeRecordId,
    idType1: mapIdType1(req.query.residentialstatus),
    idType2: mapIdType2(req.query.residentialstatus),
    createdBy: "mloNLXRNM8",
    tmpUnitAdress: req.query.unit,
    tmpFloorAddress: req.query.floor,
    tmpBlockAddress: req.query.block,
    tmpStreetAddress: req.query.street,
    tmpPostalCodeAddress: req.query.postal,
    tmpBuildingAddress: req.query.building,
    recordStatus: "Created",
  };

  if (
    employerRecordId &&
    employerRecordId !== "undefined" &&
    employerRecordId !== "" &&
    employerRecordId !== undefined
  ) {
    trainee.employer = employerRecordId;
  }
  console.log(chalk.blue("Mapped Trainee:"), trainee);
  const headers = getTadabaseHeaders();
  const traineeTableId = "VX9QoerwYv";

  const apiURL = `https://api.tadabase.io/api/v1/data-tables/${traineeTableId}/records/${traineeRecordId}`;
  const data = createTadabaseInsertPayload("/trainee.json", trainee);

  axios
    .post(apiURL, data, { headers })
    .then((response) => {
      console.log(
        chalk.blue("Create/Update Trainee TB Response:"),
        response.data
      );
      const recordId = response?.data?.recordId;

      let newRedirectURL =
        "https://ascendo.bestraining.app/us-create-trainee-by-ca";
      if (
        redirectURL &&
        redirectURL !== "null" &&
        redirectURL !== "" &&
        redirectURL !== null
      ) {
        newRedirectURL = appendQueryParam(
          removeQueryParams(redirectURL, "trainee_recordID"),
          "trainee_recordID",
          recordId
        );
      }

      res.redirect(newRedirectURL);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
});
app.get("/login", (req, res) => {
  const clientId = config.APP_CONFIG.APP_CLIENT_ID;
  const redirectUrl = config.APP_CONFIG.APP_CALLBACK_URL;
  const scope = config.APP_CONFIG.APP_SCOPES;
  const purposeId = config.APP_CONFIG.APP_PURPOSE_ID;
  const authApiUrl = config.APP_CONFIG.MYINFO_API_AUTHORIZE;
  const method = "S256";

  let pkceCodePair = connector.generatePKCECodePair();
  let sessionId = crypto.randomBytes(16).toString("hex");
  sessionIdCache[sessionId] = pkceCodePair.codeVerifier;

  res.cookie("sid", sessionId);

  const codeChallenge = pkceCodePair.codeChallenge;

  const authorizeUrl =
    authApiUrl +
    "?client_id=" +
    clientId +
    "&scope=" +
    scope +
    "&purpose_id=" +
    purposeId +
    "&code_challenge=" +
    codeChallenge +
    "&code_challenge_method=" +
    method +
    "&redirect_uri=" +
    redirectUrl;

  res.redirect(authorizeUrl);
});

app.get("/callback", async function (req, res) {
  try {
    const authCode = req.query.code;
    const codeVerifier = sessionIdCache[req.cookies.sid];
    console.log("Calling MyInfo NodeJs Library...".green);

    let privateSigningKey = fs.readFileSync(
      config.APP_CONFIG.APP_CLIENT_PRIVATE_SIGNING_KEY,
      "utf8"
    );

    let privateEncryptionKeys = [];
    readFiles(
      config.APP_CONFIG.APP_CLIENT_PRIVATE_ENCRYPTION_KEYS,
      (filename, content) => {
        privateEncryptionKeys.push(content);
      },
      (err) => {
        throw err;
      }
    );

    let personData = await connector.getMyInfoPersonData(
      authCode,
      codeVerifier,
      privateSigningKey,
      privateEncryptionKeys
    );

    console.log(
      "--- Sending Person Data From Your-Server (Backend) to Your-Client (Frontend)---:"
        .green
    );

    const formValues = dataExtractor(personData);
    let queryString = objectToQueryString(formValues);
    let finalRedirectURL = process.env.CREATE_TRAINEE_URL + "?" + queryString;

    res.redirect(finalRedirectURL);
  } catch (error) {
    console.log("---MyInfo NodeJs Library Error---".red);
    console.log(error);
    res.status(500).send({
      error: error,
    });
  }
});

app.listen(port, () =>
  console.log(chalk.magenta(`Myinfo server is listening on port ${port}!`))
);

function createTadabaseInsertPayload(path, data) {
  const fields = JSON.parse(fs.readFileSync(__dirname + path));
  const payload = {};

  for (const [key, value] of Object.entries(data)) {
    if (key in fields) {
      payload[fields[key]] = value;
    }
  }

  return payload;
}

function mapSex(sex) {
  const sexMapping = {
    FEMALE: "Female",
    MALE: "Male",
  };

  return sexMapping[sex] || sexMapping.MALE;
}

function mapRace(race) {
  const raceMapping = {
    CHINESE: "Chinese",
    MALAY: "Malay",
    INDIAN: "Indian",
    EURASIAN: "Eurasian",
    OTHERS: "Others",
  };

  return raceMapping[race.toUpperCase()] || raceMapping.OTHERS;
}

function mapNationality(nationality) {
  const nationalityMapping = {
    "SINGAPORE CITIZEN": "Singaporean Citizen",
    "SINGAPORE PERMANENT RESIDENT": "Singaporean Permanent Resident",
    OTHERS: "Others",
  };

  return (
    nationalityMapping[nationality.toUpperCase()] || nationalityMapping.OTHERS
  );
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0"); // January is month 0
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  let timeSuffix = "AM";

  if (hours > 12) {
    hours -= 12;
    timeSuffix = "PM";
  }

  return `${day}/${month}/${year} ${hours}:${minutes} ${timeSuffix}`;
}

function mapContactNumber(mobileno) {
  return new Promise((resolve, reject) => {
    const contactNumber = {
      countryCode: mobileno?.substring(1, 3),
      internationalPrefix: "+",
      phoneNumber: mobileno?.substring(3),
      contactType: "3 - Mobile Number",
      tfContactNumber: mobileno,
      recordStatus: "created",
      createdOn: formatDate(new Date()),
      createdBy: "DVWQW7GQZ4",
    };
    const headers = getTadabaseHeaders();
    const contactNumberTableId = "VX9QobGNwY";
    const apiURL = `https://api.tadabase.io/api/v1/data-tables/${contactNumberTableId}/records`;
    const data = createTadabaseInsertPayload(
      "/contactNumber.json",
      contactNumber
    );

    axios
      .post(apiURL, data, { headers })
      .then((response) => {
        console.log("Create Contact Number Response:", response.data);
        resolve(response.data.recordId);
      })
      .catch((error) => {
        console.error("Error:", error);
        reject(error);
      });
  });
}

function getTadabaseHeaders() {
  return {
    "X-Tadabase-App-id": "PzQ4D2eQJG",
    "X-Tadabase-App-Key": "SIJYmFMJYHgS",
    "X-Tadabase-App-Secret": "4bUXeHiqJxsaswM0saxy7ARp6jRTdvKm",
    "X-Tadabase-Queue-Equation": "1",
  };
}

function mapIdType1(residentialStatus) {
  const statusMap = {
    alien: "FP - Foreign Passport",
    citizen: "SP - Singapore Pink Identification Card",
    pr: "SB - Singapore Blue Identification Card",
    unknown: "OT - Others",
    "not applicable": "OT - Others",
  };

  return statusMap[residentialStatus.toLowerCase()] || "OT - Others";
}

function mapIdType2(residentialStatus) {
  const mapping = {
    alien: "Others",
    citizen: "NRIC",
    pr: "NRIC",
    unknown: "Others",
    "not applicable": "Others",
  };

  return mapping[residentialStatus.toLowerCase()] || "Others";
}

function removeQueryParams(urlString, paramName) {
  const url = new URL(urlString);
  const params = new URLSearchParams(url.search);

  params.delete(paramName);
  url.search = params.toString();

  return url.toString();
}

function appendQueryParam(urlString, paramName, paramValue) {
  const url = new URL(urlString);
  const params = new URLSearchParams(url.search);

  params.append(paramName, paramValue);
  url.search = params.toString();

  return url.toString();
}

function readFiles(dirname, onFileContent, onError) {
  fs.readdir(dirname, function (err, filenames) {
    if (err) {
      onError(err);
      return;
    }
    filenames.forEach(function (filename) {
      fs.readFile(dirname + filename, "utf8", function (err, content) {
        if (err) {
          onError(err);
          return;
        }
        onFileContent(filename, content);
      });
    });
  });
}

function dataExtractor(data) {
  let formValues = {};

  if (data.uinfin) {
    formValues.uinfin = String(data.uinfin.value);
  }

  if (data.name) {
    formValues.name = String(data.name.value);
  }

  if (data.sex) {
    formValues.sex = String(data.sex.desc);
  }

  if (data.race) {
    formValues.race = String(data.race.desc);
  }

  if (data.nationality) {
    formValues.nationality = String(data.nationality.desc);
  }

  if (data.dob) {
    formValues.dob = String(data.dob.value);
  }

  if (data.email) {
    formValues.email = String(data.email.value);
  }

  if (
    data.mobileno &&
    data.mobileno.prefix &&
    data.mobileno.areacode &&
    data.mobileno.nbr
  ) {
    formValues.mobileno =
      String(data.mobileno.prefix.value) +
      String(data.mobileno.areacode.value) +
      " " +
      String(data.mobileno.nbr.value);
  }

  if (
    data.regadd &&
    data.regadd.type === "SG" &&
    data.regadd.block &&
    data.regadd.street &&
    data.regadd.postal
  ) {
    formValues.regadd =
      String(data.regadd.block.value) +
      " " +
      String(data.regadd.street.value) +
      " \n" +
      "Singapore " +
      String(data.regadd.postal.value);

    // Extract additional fields from regadd
    if (data.regadd.building) {
      formValues.building = String(data.regadd.building.value);
    }

    if (data.regadd.floor) {
      formValues.floor = String(data.regadd.floor.value);
    }

    if (data.regadd.unit) {
      formValues.unit = String(data.regadd.unit.value);
    }

    if (data.regadd.block) {
      formValues.block = String(data.regadd.block.value);
    }

    if (data.regadd.street) {
      formValues.street = String(data.regadd.street.value);
    }

    if (data.regadd.postal) {
      formValues.postal = String(data.regadd.postal.value);
    }
  } else if (
    data.regadd &&
    data.regadd.type === "Unformatted" &&
    data.regadd.line1 &&
    data.regadd.line2
  ) {
    formValues.regadd =
      String(data.regadd.line1.value) + "\n" + String(data.regadd.line2.value);
  }

  if (data.residentialstatus) {
    formValues.residentialstatus = String(data.residentialstatus.desc);
  }

  if (data.cpfemployers && data.cpfemployers.history) {
    const latestEmployer =
      data.cpfemployers.history[data.cpfemployers.history.length - 1];
    if (
      latestEmployer &&
      latestEmployer.employer &&
      latestEmployer.employer.value
    ) {
      formValues.cpfemployers = String(latestEmployer.employer.value);
    }
  }

  return formValues;
}

function objectToQueryString(obj) {
  let queryString = "";
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (queryString !== "") {
        queryString += "&";
      }
      queryString += key + "=" + encodeURIComponent(obj[key]);
    }
  }
  return queryString;
}

async function storePrivateKeysToPEM(jsonFilePath) {
  try {
    const jsonData = fs.readFileSync(jsonFilePath, "utf8");
    const { keys } = JSON.parse(jsonData);

    for (const key of keys) {
      const keystore = await jose.JWK.createKeyStore();
      await keystore.add(key);

      const selectedKey = keystore.get(key.kid);
      const pem = selectedKey.toPEM(true);

      let filePath;
      if (key.use === "sig") {
        filePath = path.join("cert", "signing-private-key.pem");
      } else if (key.use === "enc") {
        filePath = path.join(
          "cert",
          "encryption-private-keys",
          "encryption-private-key.pem"
        );
      }

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, pem);
      console.log(
        `Private key with kid "${selectedKey.kid}" is stored in ${filePath}`
      );
    }
  } catch (error) {
    console.error("Error storing private keys to PEM:", error);
  }
}
