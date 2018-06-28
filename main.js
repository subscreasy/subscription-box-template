/**
 * Created with IntelliJ IDEA.
 * User: halil
 * Date: 28.06.2018 10:54
 */
var ApiDocumentation = require('api_documentation');

var defaultClient = ApiDocumentation.ApiClient.instance;

defaultClient.basePath = "https://sandbox.subscreasy.com";
console.log("defaultClient.basePath: " + defaultClient.basePath);

// Configure API key authorization: apiKey
var apiKey = defaultClient.authentications['apiKey'];
apiKey.apiKey = "YOUR API KEY"
// Uncomment the following line to set a prefix for the API key, e.g. "Token" (defaults to null)
//apiKey.apiKeyPrefix['Authorization'] = "Token"

var api = new ApiDocumentation.AnalyticsResourceApi()

var callback = function(error, data, response) {
    if (error) {
        console.error(error);
    } else {
        console.log('API called successfully. Returned data: ' + data);
    }
};
api.getDashboardAnalyticsUsingGET(callback);