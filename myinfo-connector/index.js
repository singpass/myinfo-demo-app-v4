const fs = require('fs');
const querystring = require('querystring');
const constant = require('./common/constant');
const urlParser = require('url');
const requestHandler = require('./lib/requestHandler.js');
const CONFIG = require('./common/config');
const log4js = require('log4js');
const logger = log4js.getLogger('MyInfoNodeJSConnector');
const crypto = require('crypto');
// ####################
logger.level = CONFIG.DEBUG_LEVEL;
// Exporting the Module
// ####################

/**
 * MyInfoConnector Constructor
 * 
 * This is a constructor to validate and initialize all the config variables
 * 
 * @param {{
 * CLIENT_PRIVATE_KEY : string, 
 * CLIENT_ID : string,
 * REDIRECT_URL : string,
 * SCOPE : string,
 * AUTHORIZE_JWKS_URL : string,
 * MYINFO_JWKS_URL : string,
 * TOKEN_URL : string, 
 * PERSON_URL : string,
 * ENABLE_JWE : string,
 * ENABLE_JWS : string,
 * USE_PROXY : string, 
 * PROXY_TOKEN_URL : string, 
 * PROXY_PERSON_URL : string
 * }}
 */
class MyInfoConnector {

    isInitialized = false;

    constructor(config) {
        try {
            this.load(config);
            this.isInitialized = true;
            this.securityHelper = require('./lib/securityHelper');
        } catch (error) {
            logger.error('Error (Library Init): ', error);
            this.isInitialized = false;
            throw error;
        }
    }

    load = function (config) {
        if (config.DEBUG_LEVEL) {
            CONFIG.DEBUG_LEVEL = config.DEBUG_LEVEL;
            logger.level = CONFIG.DEBUG_LEVEL;
        }
        if (!config.CLIENT_ID) {
            throw (constant.ERROR_CONFIGURATION_CLIENT_ID_NOT_FOUND);
        } else {
            CONFIG.CLIENT_ID = config.CLIENT_ID;
        }
        if (!config.REDIRECT_URL) {
            throw (constant.ERROR_CONFIGURATION_REDIRECT_URL_NOT_FOUND);
        } else {
            CONFIG.REDIRECT_URL = config.REDIRECT_URL;
        }
        if (!config.CLIENT_PRIVATE_KEY) {
            throw (constant.ERROR_CONFIGURATION_CLIENT_PRIVATE_KEY_NOT_FOUND);
        } else {
            CONFIG.CLIENT_PRIVATE_KEY = fs.readFileSync(config.CLIENT_PRIVATE_KEY, 'utf8');
        }
        if (!config.TOKEN_URL) {
            throw (constant.ERROR_CONFIGURATION_TOKEN_URL_NOT_FOUND);
        } else {
            CONFIG.TOKEN_URL = config.TOKEN_URL;
        }
        if (!config.PERSON_URL) {
            throw (constant.ERROR_CONFIGURATION_PERSON_URL_NOT_FOUND);
        } else {
            CONFIG.PERSON_URL = config.PERSON_URL;
        }
        if (!config.SCOPE) {
            throw (constant.ERROR_CONFIGURATION_SCOPE_NOT_FOUND);
        } else {
            CONFIG.SCOPE = config.SCOPE;
        }
        if (!config.ENABLE_JWE) {
            throw (constant.ERROR_ENABLE_JWE_FLAG_NOT_FOUND);
        } else {
            if (config.ENABLE_JWE == 'Y') {
                CONFIG.ENABLE_JWE = true;
            } else if (config.ENABLE_JWE == 'N') {
                CONFIG.ENABLE_JWE = false;
            } else {
                throw constant.ERROR_INVALID_ENABLE_JWE_FLAG;
            }
        }
        if (!config.ENABLE_JWS) {
            throw (constant.ERROR_ENABLE_JWS_FLAG_NOT_FOUND);
        } else {
            if (config.ENABLE_JWS == 'Y') {
                CONFIG.ENABLE_JWS = true;
            } else if (config.ENABLE_JWS == 'N') {
                CONFIG.ENABLE_JWS = false;
            } else {
                throw constant.ERROR_INVALID_ENABLE_JWS_FLAG;
            }
        }
        if (config.AUTHORIZE_JWKS_URL) {
            CONFIG.AUTHORIZE_JWKS_URL = config.AUTHORIZE_JWKS_URL;
        }
        if (config.MYINFO_JWKS_URL) {
            CONFIG.MYINFO_JWKS_URL = config.MYINFO_JWKS_URL;
        }
        if (config.MYINFO_SINGPASS_ESERVICE_ID) {
            CONFIG.MYINFO_SINGPASS_ESERVICE_ID = config.MYINFO_SINGPASS_ESERVICE_ID;
        }
        if (config.USE_PROXY === 'Y') {
            CONFIG.USE_PROXY = 'Y';
            if (!config.PROXY_TOKEN_URL) {
                throw (constant.ERROR_CONFIGURATION_PROXY_TOKEN_URL_NOT_FOUND);
            } else {
                CONFIG.PROXY_TOKEN_URL = config.PROXY_TOKEN_URL;
            }
            if (!config.PROXY_PERSON_URL) {
                throw (constant.ERROR_CONFIGURATION_PROXY_PERSON_URL_NOT_FOUND);
            } else {
                CONFIG.PROXY_PERSON_URL = config.PROXY_PERSON_URL;
            }
        }
    }

    /**
     * This method generates the code verifier and code challenge for the PKCE flow.
     * 
     * @returns {Object} - Returns an object consisting of the code verifier and the code challenge
     */
    generatePKCECodePair = function () {
        try {
            let codeVerifier = this.securityHelper.base64URLEncode(crypto.randomBytes(32));
            let codeChallenge = this.securityHelper.base64URLEncode(this.securityHelper.sha256(codeVerifier));

            return {
                codeVerifier: codeVerifier,
                codeChallenge: codeChallenge
            };
        } catch (error) {
            logger.error('generateCodeChallenge - Error: ', error);
            throw (error);
        }
    }

    /**
     * Get MyInfo Person Data (MyInfo Token + Person API)
     * 
     * This method takes in all the required variables, invoke the following APIs. 
     * - Get Access Token (Token API) - to get Access Token by using the Auth Code
     * - Get Person Data (Person API) - to get Person Data by using the Access Token
     * 
     * @param {string} authCode - Authorization Code from Authorize API
     * @returns {Promise} - Returns the Person Data (Payload decrypted + Signature validated)
     */
    getMyInfoPersonData = async function (authCode, codeVerifier) {
        if (!this.isInitialized) {
            throw (constant.ERROR_UNKNOWN_NOT_INIT);
        }

        try {
            let sessionEncKeyPair = CONFIG.ENABLE_JWE ? await this.securityHelper.generateSessionKeyPair() : null;
            let sessionPopKeyPair = CONFIG.ENABLE_JWS ? await this.securityHelper.generateSessionKeyPair() : null;
            let createTokenResult = await this.getAccessToken(authCode, codeVerifier, sessionEncKeyPair, sessionPopKeyPair);
            let accessToken = JSON.parse(createTokenResult).access_token;
            let personData = await this.getPersonData(accessToken, sessionEncKeyPair, sessionPopKeyPair);
            return personData;
        } catch (error) {
            throw (error);
        }
    }

    /**
     * Get Access Token from MyInfo Token API
     * 
     * This method calls the Token API and obtain an "access token", 
     * which can be used to call the Person API for the actual data.
     * Your application needs to provide a valid "authorisation code" 
     * from the authorize API in exchange for the "access token".
     * 
     * @param {string} authCode - Authorization Code from authorize API
     * @returns {Promise} - Returns the Access Token
     */
    getAccessToken = async function (authCode, codeVerifier, sessionEncKeyPair, sessionPopKeyPair) {
        if (!this.isInitialized) {
            throw (constant.ERROR_UNKNOWN_NOT_INIT);
        }

        try {
            let privateKey = CONFIG.CLIENT_PRIVATE_KEY;

            let tokenResult = await this.callTokenAPI(authCode, privateKey, codeVerifier, sessionEncKeyPair, sessionPopKeyPair);
            let token = tokenResult.msg;
            logger.debug('Access Token: ', token);

            return token;
        } catch (error) {
            logger.error('getAccessToken - Error: ', error);
            throw (error);
        }
    }

    /**
     * Get Person Data from MyInfo Person API
     * 
     * This method calls the Person API and returns a JSON response with the
     * personal data that was requested. Your application needs to provide a
     * valid "access token" in exchange for the JSON data. Once your application
     * receives this JSON data, you can use this data to populate the online
     * form on your application.
     * 
     * @param {string} accessToken - Access token from Token API
     * @returns {Promise} Returns the Person Data (Payload decrypted + Signature validated)
     */
    getPersonData = async function (accessToken, sessionEncKeyPair, sessionPopKeyPair) {
        if (!this.isInitialized) {
            throw (constant.ERROR_UNKNOWN_NOT_INIT);
        }

        try {
            let callPersonRequestResult = await this.getPersonDataWithToken(accessToken, sessionEncKeyPair, sessionPopKeyPair);
            logger.debug('Person Data: ', callPersonRequestResult);

            return callPersonRequestResult;
        } catch (error) {
            logger.error('getPersonData - Error: ', error);
            throw (error);
        }
    }

    /**
     * Call (Access) Token API
     * 
     * This method will generate the Token request
     * and call the Token API to retrieve access Token
     * 
     * @param {string} authCode - Authorization Code from authorize API
     * @param {File} privateKey - The Client Private Key in PEM format
     * @returns {Promise} - Returns the Access Token
     */
    callTokenAPI = async function (authCode, privateKey, codeVerifier, sessionEncKeyPair, sessionPopKeyPair) {

        let cacheCtl = "no-cache";
        let contentType = "application/x-www-form-urlencoded";
        let method = constant.HTTP_METHOD.POST;
        let clientAssertionType = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

        // assemble params for Token API
        let strParams = "grant_type=authorization_code" +
            "&code=" + authCode +
            "&redirect_uri=" + CONFIG.REDIRECT_URL +
            "&client_id=" + CONFIG.CLIENT_ID +
            "&code_verifier=" + codeVerifier +
            "&client_assertion_type=" + clientAssertionType +
            "&client_assertion=" + await this.securityHelper.generateClientAssertion(CONFIG.TOKEN_URL, CONFIG.CLIENT_ID, privateKey, sessionEncKeyPair, sessionPopKeyPair);

        let params = querystring.parse(strParams);

        // assemble headers for Token API
        let strHeaders = "Content-Type=" + contentType + "&Cache-Control=" + cacheCtl;
        let headers = querystring.parse(strHeaders);

        // invoke Token API
        let tokenURL = (CONFIG.USE_PROXY && CONFIG.USE_PROXY == 'Y') ? CONFIG.PROXY_TOKEN_URL : CONFIG.TOKEN_URL;
        let parsedTokenUrl = urlParser.parse(tokenURL);
        let tokenDomain = parsedTokenUrl.hostname;
        let tokenRequestPath = parsedTokenUrl.path;

        let accessToken = await requestHandler.getHttpsResponse(tokenDomain, tokenRequestPath, headers, method, params);

        return accessToken;
    };

    /**
     * Call Person API
     * 
     * This method will generate the Person request and 
     * call the Person API to get the encrypted Person Data
     * 
     * @param {string} sub - The retrieved uinfin or uuid sub from the decoded token
     * @param {string} accessToken - The Access token from Token API that has been verified and decoded from Token API 
     * @returns {Promise} Returns result from calling Person API
     */
    callPersonAPI = async function (sub, accessToken, sessionPopKeyPair) {
        let urlLink;

        //Code to handle Myinfo Biz Entity Person URL
        if (CONFIG.PERSON_URL.includes("biz")) {
            let subTemp = sub.split("_");
            var uen = subTemp[0];
            var uuid = subTemp[1];
            urlLink = CONFIG.PERSON_URL + "/" + uen + "/" + uuid;
        } else {
            urlLink = CONFIG.PERSON_URL + "/" + sub;
        }

        let cacheCtl = "no-cache";
        let method = constant.HTTP_METHOD.GET;

        // assemble params for Person API
        let strParams = "client_id=" + CONFIG.CLIENT_ID +
            "&scope=" + encodeURIComponent(CONFIG.SCOPE);

        //Singpass e-service ID will only be passed in for Myinfo TUO applications
        if (CONFIG.MYINFO_SINGPASS_ESERVICE_ID) {
            strParams += "&sp_esvcId=" + CONFIG.MYINFO_SINGPASS_ESERVICE_ID;
        }

        // assemble headers for Person API
        let strHeaders = "Cache-Control=" + cacheCtl;
        let headers = querystring.parse(strHeaders);

        // Generate dpop token only if ENABLE_JWE flag is true
        if (CONFIG.ENABLE_JWE) {
            let decodedToken = await this.securityHelper.verifyJWS(accessToken, CONFIG.AUTHORIZE_JWKS_URL);
            let dpopToken = await this.securityHelper.generateDpop(urlLink, decodedToken, method, sessionPopKeyPair);
            headers['dpop'] = dpopToken;
        }

        headers['Authorization'] = "Bearer " + accessToken;

        logger.info('Authorization Header for MyInfo Person API: ', JSON.stringify(headers));

        // invoke person API
        let personURL = (CONFIG.USE_PROXY && CONFIG.USE_PROXY == 'Y') ? CONFIG.PROXY_PERSON_URL : CONFIG.PERSON_URL;
        let parsedUrl = urlParser.parse(personURL);
        let domain = parsedUrl.hostname;
        let requestPath = CONFIG.PERSON_URL.includes("biz") ? (parsedUrl.path + "/" + uen + "/" + uuid + "?" + strParams) : (parsedUrl.path + "/" + sub + "?" + strParams);
        //invoking https to do GET call
        let personData = await requestHandler.getHttpsResponse(domain, requestPath, headers, method, null);

        return personData;
    };

    /**
     * Get Person Data
     * 
     * This method will take in the accessToken from Token API and decode it 
     * to get the sub(eg either uinfin or uuid). It will call the Person API using the token and sub.
     * It will verify the Person API data's signature and decrypt the result.
     * 
     * @param {string} accessToken - The token that has been verified from Token API 
     * @returns {Promise} Returns decrypted result from calling Person API
     */
    getPersonDataWithToken = async function (accessToken, sessionEncKeyPair, sessionPopKeyPair) {
        try {
            let decodedToken = await this.securityHelper.verifyJWS(accessToken, CONFIG.AUTHORIZE_JWKS_URL);
            logger.debug('Decoded Access Token (from MyInfo Token API): ', decodedToken);
            if (!decodedToken) {
                logger.error('Error: ', constant.ERROR_INVALID_TOKEN);
                throw (constant.ERROR_INVALID_TOKEN);
            }

            let uinfin = decodedToken.sub;
            if (!uinfin) {
                logger.error('Error: ', constant.ERROR_UINFIN_NOT_FOUND);
                throw (constant.ERROR_UINFIN_NOT_FOUND);
            }

            let personResult = await this.callPersonAPI(uinfin, accessToken, sessionPopKeyPair);
            let decryptedResponse;
            if (personResult && personResult.msg) {
                let msg = personResult.msg;
                if (!CONFIG.ENABLE_JWE) {
                    decryptedResponse = JSON.parse(msg.toString());
                } else {
                    logger.debug('MyInfo PersonAPI Response (JWE+JWS): ', msg);
                    let jws = await this.securityHelper.decryptJWEWithKey(msg, sessionEncKeyPair);
                    logger.debug('Decrypted JWE: ', jws);
                    decryptedResponse = jws;
                }
            } else {
                logger.error('Error: ', constant.ERROR);
                throw (constant.ERROR);
            }

            let decodedData;
            if (!CONFIG.ENABLE_JWS) {
                decodedData = decryptedResponse;
                logger.debug('Person Data (Plain): ', decodedData);
            } else {
                if (!decryptedResponse) {
                    logger.error('Error: ', constant.ERROR_INVALID_DATA_OR_SIGNATURE);
                    throw (constant.ERROR_INVALID_DATA_OR_SIGNATURE);
                }

                decodedData = await this.securityHelper.verifyJWS(decryptedResponse, CONFIG.MYINFO_JWKS_URL);
                // successful. return data back to frontend
                logger.debug('Person Data (JWE Decrypted + JWS Verified): ', JSON.stringify(decodedData));
            }

            return decodedData;
        } catch (error) {
            throw (error);
        }
    }
}
module.exports = MyInfoConnector;