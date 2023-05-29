const express = require("express");
var path = require("path");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
const cors = require("cors");
const crypto = require("crypto");
var MyInfoConnector = require("myinfo-connector-v4-nodejs");
const fs = require("fs");
const jose = require("node-jose");

const app = express();
const port = 3001;
const config = require("./config/config.js");
const connector = new MyInfoConnector(config.MYINFO_CONNECTOR_CONFIG);

var sessionIdCache = {};
let tadabaseRedirectURL;

app.use(express.json());
app.use(cors());

app.set("views", path.join(__dirname, "public/views"));
app.set("view engine", "pug");

app.use(express.static("public"));

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
  tadabaseRedirectURL = req.query.tadabaseRedirectURL;

  const clientId = config.APP_CONFIG.DEMO_APP_CLIENT_ID;
  const redirectUrl = config.APP_CONFIG.DEMO_APP_CALLBACK_URL;
  const scope = config.APP_CONFIG.DEMO_APP_SCOPES;
  const purposeId = config.APP_CONFIG.DEMO_APP_PURPOSE_ID;
  const authApiUrl = config.APP_CONFIG.MYINFO_API_AUTHORIZE;
  const subentity = config.APP_CONFIG.DEMO_APP_SUBENTITY_ID;

  const method = "S256";
  const clientAssertionType =
    "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

  let securityEnable;

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
  const authCode = req.query.code;
  //retrieve code verifier from session cache
  const codeVerifier = sessionIdCache[req.cookies.sid];
  console.log("Calling MyInfo NodeJs Library...".green);

  // retrieve private siging key and decode to utf8 from FS
  let privateSigningKey = fs.readFileSync(
    config.APP_CONFIG.DEMO_APP_CLIENT_PRIVATE_SIGNING_KEY,
    "utf8"
  );

  let privateEncryptionKeys = [];
  // retrieve private encryption keys and decode to utf8 from FS, insert all keys to array
  console.log(
    "config.APP_CONFIG.DEMO_APP_CLIENT_PRIVATE_ENCRYPTION_KEYS",
    config.APP_CONFIG.DEMO_APP_CLIENT_PRIVATE_ENCRYPTION_KEYS
  );
  readFiles(
    config.APP_CONFIG.DEMO_APP_CLIENT_PRIVATE_ENCRYPTION_KEYS,
    (filename, content) => {
      privateEncryptionKeys.push(content);
    },
    (err) => {
      throw err;
    }
  );

  console.log("authCode", authCode);
  console.log("codeVerifier", codeVerifier);
  console.log("privateSigningKey", privateSigningKey);
  console.log("privateEncryptionKeys", privateEncryptionKeys);

  // call myinfo connector to retrieve data
  let personData = await connector.getMyInfoPersonData(
    authCode,
    codeVerifier,
    privateSigningKey,
    privateEncryptionKeys
  );

  console.log("personData", personData);
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

app.listen(port, () =>
  console.log(`Demo App Client listening on port ${port}!`)
);
