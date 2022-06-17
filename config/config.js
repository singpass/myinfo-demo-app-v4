
/**
 * Myinfo Demo App supports the following environments:
 * 
 * SANDBOX: 
 * Without Encryption and Signing
 * Note: The sandbox environment is used for your testing when developing your prototype
 * 
 * TEST:
 * With Encryption and Signing 
 * Note: The test environment is used for testing your application with the full security measures required in production
 */
let ENVIRONMENT = process.argv[2];

let APP_CONFIG = {
  'DEMO_APP_CLIENT_ID': 'STG2-MYINFO-SELF-TEST', //need to update to demo app for roll out
  'DEMO_APP_CLIENT_PRIVATE_KEY': './cert/your-sample-app-certificate-private-key.pem',
  'DEMO_APP_CALLBACK_URL': 'http://localhost:3001/callback',
  'DEMO_APP_PURPOSE_ID': 'demonstration',
  'DEMO_APP_SCOPES': 'uinfin name sex race nationality dob email mobileno regadd housingtype hdbtype marital edulevel noa-basic ownerprivate cpfcontributions cpfbalances',
  'MYINFO_API_AUTHORIZE': `https://${ENVIRONMENT}.api.myinfo.gov.sg/com/v4/authorize`
}


/**
 * Set following configuration for MyInfo library to call token and person API
 * Based on the environment, the corresponding config will be used.
 * IMPORTANT: DO NOT rename the JSON Keys
 * 
 * Myinfo Connector config has the following mandatory parameters:
 * 
 * CLIENT_ID: Client id provided during onboarding
 * CLIENT_SECURE_CERT: Alias of the application private key in P12 format
 * CLIENT_SECURE_CERT_PASSPHRASE: Password of the private key
 * REDIRECT_URL: Redirect URL for web application
 * SCOPE: Space separated list of attributes to be retrieved from Myinfo
 * AUTHORIZE_JWKS_URL: The URL to retrieve authorize JWKS public key
 * MYINFO_JWKS_URL: The URL to retrieve Myinfo JWKS public key
 * TOKEN_URL: The URL for Token API
 * PERSON_URL: The URL for Person API
 * ENABLE_JWE: Determines whether encryption is used in the application. Values accepted: Y or N. 
 * ENABLE_JWS: Determines whether signing is used in the application. Values accepted: Y or N. 
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
  'CLIENT_ID': APP_CONFIG.DEMO_APP_CLIENT_ID,
  'CLIENT_PRIVATE_KEY': APP_CONFIG.DEMO_APP_CLIENT_PRIVATE_KEY,
  'REDIRECT_URL': APP_CONFIG.DEMO_APP_CALLBACK_URL,
  'SCOPE': APP_CONFIG.DEMO_APP_SCOPES,
  'AUTHORIZE_JWKS_URL': `https://test.authorise.singpass.gov.sg/.well-known/keys.json`,
  'MYINFO_JWKS_URL': `https://test.authorise.singpass.gov.sg/.well-known/keys.json`,
  'TOKEN_URL': `https://${ENVIRONMENT}.api.myinfo.gov.sg/com/v4/token`,
  'PERSON_URL': `https://${ENVIRONMENT}.api.myinfo.gov.sg/com/v4/person`,
  'ENABLE_JWE': ENVIRONMENT.toUpperCase() == "SANDBOX" ? 'N' : 'Y',
  'ENABLE_JWS': ENVIRONMENT.toUpperCase() == "SANDBOX" ? 'N' : 'Y',
  'USE_PROXY': 'N',
  'PROXY_TOKEN_URL': '',
  'PROXY_PERSON_URL': '',
  'DEBUG_LEVEL': 'info'
}

module.exports.APP_CONFIG = APP_CONFIG;
module.exports.MYINFO_CONNECTOR_CONFIG = MYINFO_CONNECTOR_CONFIG;