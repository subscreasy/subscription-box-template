/**
 * Created with IntelliJ IDEA.
 * User: halil
 * Date: 28.06.2018 10:54
 */
var companyName = "browsymous";
var remoteHost = "http://localhost:8080";
var threedsCallbackUrl = "http://localhost:8081/success.html";

var ApiDocumentation = require('api_documentation');

var defaultClient = ApiDocumentation.ApiClient.instance;
defaultClient.basePath = remoteHost;
console.log("defaultClient.basePath: " + defaultClient.basePath);

// Configure API key authorization: apiKey
// var apiKey = defaultClient.authentications['apiKey'];
// apiKey.apiKey = "YOUR API KEY";
// Uncomment the following line to set a prefix for the API key, e.g. "Token" (defaults to null)
// apiKey.apiKeyPrefix['Authorization'] = "Token"

global.remoteHost = remoteHost;
global.companyName = companyName;
global.callbackUrl = threedsCallbackUrl;
global.authorization = defaultClient.authentications['apiKey'];

global.accountResourceApi = new ApiDocumentation.AccountResourceApi();
global.subsriptionResourceApi = new ApiDocumentation.SubsriptionResourceApi();
global.userJwtControllerApi = new ApiDocumentation.UserJwtControllerApi();
global.productResourceApi = new ApiDocumentation.ProductResourceApi();
global.orderResourceApi = new ApiDocumentation.OrderResourceApi();

var managedUser = function(login, password) {
    var managedUserVM = new ApiDocumentation.UserDTO(); // UserDTO | managedUserVM
    managedUserVM.login = login;
    managedUserVM.email = login;
    managedUserVM.password = password;
    managedUserVM.company = {"name": companyName};
    managedUserVM.authorities = ["ROLE_SUBSCRIBER"];

    return managedUserVM;
};
global.managedUserFunc = managedUser;

var startSubscriptionRequest = function (subscriber, paymentCard, offer) {
    var startSubscriptionRequest = new ApiDocumentation.StartSubscriptionRequest();
    startSubscriptionRequest.subscriber = subscriber;
    startSubscriptionRequest.paymentCard = paymentCard;
    startSubscriptionRequest.offer = offer;

    return startSubscriptionRequest;
}
global.startSubscriptionRequestFunc = startSubscriptionRequest;

var login = function(login, password) {
    var loginVM = new ApiDocumentation.LoginVM(); // UserDTO | managedUserVM
    loginVM.username = login;
    loginVM.password = password;
    loginVM.company = companyName;

    return loginVM;
};
global.loginFunc = login;

var isLoggedIn = function () {
    var token = localStorage.getItem("authenticationToken");
    return token !== undefined && token !== null && token !== "";
};
global.isLoggedInFunc = isLoggedIn;

var authorizationToken = function () {
    return "Bearer " + localStorage.getItem("authenticationToken");
};
global.authorizationTokenFunc = authorizationToken;

var logout = function () {
    localStorage.removeItem("authenticationToken");
};
global.logoutFunc = logout;

var formPost = function (data, callback) {
    $.ajax({
        url: defaultClient.basePath + "/na/order/create/4ds",
        type: 'POST',
        data: data,
        contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
        mimeType: 'text/html',
        success: callback,
        error: callback
    });
};
global.formPost = formPost;
