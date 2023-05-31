const express = require("express");
let path = require("path");
let bodyParser = require("body-parser");
let cookieParser = require("cookie-parser");
const cors = require("cors");
const crypto = require("crypto");
let MyInfoConnector = require("myinfo-connector-v4-nodejs");
const fs = require("fs");
const jose = require("node-jose");

const app = express();
const port = 3001;
const config = require("./config/config.js");
const connector = new MyInfoConnector(config.MYINFO_CONNECTOR_CONFIG);

let sessionIdCache = {};

app.use(express.json());
app.use(cors());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

// Set up a route to serve the HTML file
app.get("/createTrainee", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);
app.use(cookieParser());

app.get("/jwks", async function (req, res) {
  const keysPath = __dirname + "/keys.json";

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

  // console.log(keyStore.get("7w-lDyQPgPAL1exliq00DcQ2cEsw422oRYUCwsR5NIE").toPEM(true))
  res.send(keyStore.toJSON());
});

app.get("/login", (req, res) => {
  const clientId = config.APP_CONFIG.APP_CLIENT_ID;
  const redirectUrl = config.APP_CONFIG.APP_CALLBACK_URL;
  const scope = config.APP_CONFIG.APP_SCOPES;
  const purposeId = config.APP_CONFIG.APP_PURPOSE_ID;
  const authApiUrl = config.APP_CONFIG.MYINFO_API_AUTHORIZE;
  // const subentity = config.APP_CONFIG.APP_SUBENTITY_ID;

  const method = "S256";
  // const clientAssertionType =
  //   "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

  // let securityEnable;

  // call connector to generate code_challenge and code_verifier
  let pkceCodePair = connector.generatePKCECodePair();
  // create a session and store code_challenge and code_verifier pair
  let sessionId = crypto.randomBytes(16).toString("hex");
  sessionIdCache[sessionId] = pkceCodePair.codeVerifier;
  // codeVerifier = pkceCodePair.codeVerifier;

  //establish a frontend session with browser to retrieve back code_verifier
  res.cookie("sid", sessionId);
  //send code code_challenge to frontend to make /authorize call
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

// callback function - directs back to home page
app.get("/callback", async function (req, res) {
  try {
    const authCode = req.query.code;
    //retrieve code verifier from session cache
    const codeVerifier = sessionIdCache[req.cookies.sid];
    console.log("Calling MyInfo NodeJs Library...".green);

    // retrieve private siging key and decode to utf8 from FS
    let privateSigningKey = fs.readFileSync(
      config.APP_CONFIG.APP_CLIENT_PRIVATE_SIGNING_KEY,
      "utf8"
    );

    let privateEncryptionKeys = [];
    // retrieve private encryption keys and decode to utf8 from FS, insert all keys to array
    readFiles(
      config.APP_CONFIG.APP_CLIENT_PRIVATE_ENCRYPTION_KEYS,
      (filename, content) => {
        privateEncryptionKeys.push(content);
      },
      (err) => {
        throw err;
      }
    );

    // call myinfo connector to retrieve data
    let personData = await connector.getMyInfoPersonData(
      authCode,
      codeVerifier,
      privateSigningKey,
      privateEncryptionKeys
    );

    /* 
      P/s: Your logic to handle the person data ...
    */
    console.log(
      "--- Sending Person Data From Your-Server (Backend) to Your-Client (Frontend)---:"
        .green
    );

    const formValues = dataExtractor(personData);
    // Convert JSON object to query string
    let queryString = objectToQueryString(formValues);
    // Construct the final URL
    let finalRedirectURL = process.env.CREATE_TRAINEE_URL + "?" + queryString;

    console.log(finalRedirectURL); // for testing only

    res.redirect(finalRedirectURL);
  } catch (error) {
    console.log("---MyInfo NodeJs Library Error---".red);
    console.log(error);
    res.status(500).send({
      error: error,
    });
  }
});

//function to read multiple files from a directory
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

// Function to convert JSON object to a query string
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

app.listen(port, () =>
  console.log(`Myinfo server is listening on port ${port}!`)
);
