const express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
const cors = require('cors');
const colors = require('colors');
const crypto = require('crypto');
var MyInfoConnector = require('./myinfo-connector/index.js');

const app = express();
const port = 3001;
const config = require('./config/config.js');
const connector = new MyInfoConnector(config.MYINFO_CONNECTOR_CONFIG);

var sessionIdCache = {};

app.use(express.json());
app.use(cors());

app.set('views', path.join(__dirname, 'public/views'));
app.set('view engine', 'pug');

app.use(express.static('public'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(cookieParser());

app.get('/', function (req, res) {
    res.sendFile(__dirname + `/public/index.html`);
});

// get the environment variables (app info) from the config
app.get('/getEnv', function (req, res) {

    try {
        if (config.APP_CONFIG.DEMO_APP_CLIENT_ID == undefined || config.APP_CONFIG.DEMO_APP_CLIENT_ID == null) {
            res.status(500).send({
                "error": "Missing Client ID"
            });
        } else {
            res.status(200).send({
                "clientId": config.APP_CONFIG.DEMO_APP_CLIENT_ID,
                "redirectUrl": config.APP_CONFIG.DEMO_APP_CALLBACK_URL,
                "scope": config.APP_CONFIG.DEMO_APP_SCOPES,
                "purpose_id": config.APP_CONFIG.DEMO_APP_PURPOSE_ID,
                "authApiUrl": config.APP_CONFIG.MYINFO_API_AUTHORIZE,
            });
        }
    } catch (error) {
        console.log("Error".red, error);
        res.status(500).send({
            "error": error
        });
    }
});

// callback function - directs back to home page
app.get('/callback', function (req, res) {
    res.sendFile(__dirname + `/public/index.html`);
});

// getPersonData function - call MyInfo Token + Person API
app.post('/getPersonData', async function (req, res, next) {
    try {
        // get variables from frontend
        var authCode = req.body.authCode;
        var codeVerifier = sessionIdCache[req.cookies.sid];
        console.log("Calling MyInfo NodeJs Library...".green);

        let personData = await connector.getMyInfoPersonData(authCode, codeVerifier);

        /* 
        P/s: Your logic to handle the person data ...
        */
        console.log('--- Sending Person Data From Your-Server (Backend) to Your-Client (Frontend)---:'.green);
        console.log(JSON.stringify(personData)); // log the data for demonstration purpose only
        res.status(200).send(personData); //return personData

    } catch (error) {
        console.log("---MyInfo NodeJs Library Error---".red);
        console.log(error);
        res.status(500).send({
            "error": error
        });
    }
});

// Generate the code verifier and code challenge for PKCE flow
app.post('/generateCodeChallenge', async function (req, res, next) {
    try {
        let pkceCodePair = connector.generatePKCECodePair();
        let sessionId = crypto.randomBytes(16).toString('hex');
        sessionIdCache[sessionId] = pkceCodePair.codeVerifier;

        res.cookie("sid", sessionId);
        res.status(200).send(pkceCodePair.codeChallenge);
    } catch (error) {
        console.log("Error".red, error);
        res.status(500).send({
            "error": error
        });
    }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers
// print stacktrace on error
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: err
    });
});

app.listen(port, () => console.log(`Demo App Client listening on port ${port}!`));