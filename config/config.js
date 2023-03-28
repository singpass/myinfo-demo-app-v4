
/**
 * Myinfo Demo App supports the following environments:
 * 
 * TEST:
 * With Encryption and Signing 
 * Note: The test environment is used for testing your application with the full security measures required in production
 */

let ENVIRONMENT = process.argv[2];
let urlEnvironmentPrefix = ENVIRONMENT == "prod" ? "" : `${ENVIRONMENT}.`;

/**
 * Set the following demo app configurations for the demo app to run
 * 
 * DEMO_APP_CLIENT_ID: Client id provided during onboarding
 * DEMO_APP_SUBENTITY_ID: optional parameter for platform applications only
 * DEMO_APP_CLIENT_PRIVATE_SIGNING_KEY : private signing key for client_assertion
 * DEMO_APP_CLIENT_PRIVATE_ENCRYPTION_KEYS : folder to private encryption keys, allow multiple keys to match multiple encryption keys in JWKS
 * DEMO_APP_PURPOSE_ID: purpose_id with reference to purpose that will be shown to user on consent page provided during onboarding
 * DEMO_APP_SCOPES: Space separated list of attributes to be retrieved from Myinfo
 * MYINFO_API_AUTHORIZE: The URL for Authorize API
 */
let APP_CONFIG = {
  // DEMO_APP_CLIENT_ID: "STG2-MYINFO-DEMO-APP", 
  DEMO_APP_CLIENT_ID: "STG2-MYINFO-SELF-TEST", 
  DEMO_APP_SUBENTITY_ID: "", //only for platform apps
  DEMO_APP_CLIENT_PRIVATE_SIGNING_KEY: "./cert/your-sample-app-signing-private-key.pem",
  DEMO_APP_CLIENT_PRIVATE_ENCRYPTION_KEYS: "./cert/encryption-private-keys/",
  DEMO_APP_CALLBACK_URL: "http://localhost:3001/callback",
  DEMO_APP_PURPOSE_ID: "demonstration",
  DEMO_APP_SCOPES : "uinfin name sex race nationality dob email mobileno regadd housingtype hdbtype marital edulevel noa-basic ownerprivate cpfcontributions cpfbalances",
  MYINFO_API_AUTHORIZE: `https://${urlEnvironmentPrefix}api.myinfo.gov.sg/com/v4/authorize`
};


/**
 * Set following configuration for MyInfo library to call token and person API
 * Based on the environment, the corresponding config will be used.
 * IMPORTANT: DO NOT rename the JSON Keys
 *
 * Myinfo Connector config has the following mandatory parameters:
 *
 * CLIENT_ID: Client id provided during onboarding
 * REDIRECT_URL: Redirect URL for web application
 * SCOPE: Space separated list of attributes to be retrieved from Myinfo
 * AUTHORIZE_JWKS_URL: The URL to retrieve authorize JWKS public key
 * MYINFO_JWKS_URL: The URL to retrieve Myinfo JWKS public key
 * TOKEN_URL: The URL for Token API
 * PERSON_URL: The URL for Person API
 *
 * Optional parameters
 * CLIENT_ASSERTION_SIGNING_KID : kid that will be appended to client_assertion header to match JWKS kid
 * SUBENTITY_ID: optional parameter for platform applications only
 * 
 * Proxy parameters are optional:
 * USE_PROXY: Indicate whether proxy url is used. Values accepted: Y or N
 * PROXY_TOKEN_URL: Configure your proxy url here, if any.
 * PROXY_PERSON_URL: Configure your proxy url here, if any.
 *
 * Miscellaneous parameters:
 * DEBUG_LEVEL
 *
 * Debug level for library logging. i.e 'error, info, debug' leave empty to turn off logs (OPTIONAL)
 * error - Log out all the errors returned from the library
 * info - log urls called, authorization headers and errors from the library
 * debug - Full logs from the library, i.e (errors, urls, authorization headers, API response)
 * NOTE: debug mode should never be turned on in production
 */

let MYINFO_CONNECTOR_CONFIG = {
  CLIENT_ID: APP_CONFIG.DEMO_APP_CLIENT_ID,
  SUBENTITY_ID: APP_CONFIG.DEMO_APP_SUBENTITY_ID,
  REDIRECT_URL: APP_CONFIG.DEMO_APP_CALLBACK_URL,
  SCOPE : APP_CONFIG.DEMO_APP_SCOPES,
  AUTHORIZE_JWKS_URL: `https://${urlEnvironmentPrefix}authorise.singpass.gov.sg/.well-known/keys.json`,
  MYINFO_JWKS_URL: `https://${urlEnvironmentPrefix}authorise.singpass.gov.sg/.well-known/keys.json`,
  TOKEN_URL: `https://${urlEnvironmentPrefix}api.myinfo.gov.sg/com/v4/token`,
  PERSON_URL: `https://${urlEnvironmentPrefix}api.myinfo.gov.sg/com/v4/person`,
  CLIENT_ASSERTION_SIGNING_KID :'', // optional parameter to specify specific kid for signing. Default will be thumbprint of JWK
  USE_PROXY: "N",
  PROXY_TOKEN_URL: "",
  PROXY_PERSON_URL: "",
  DEBUG_LEVEL: "info"
};


console.log("MYINFO_CONNECTOR_CONFIG", MYINFO_CONNECTOR_CONFIG);


module.exports.APP_CONFIG = APP_CONFIG;
module.exports.MYINFO_CONNECTOR_CONFIG = MYINFO_CONNECTOR_CONFIG;