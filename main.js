/**
 * Created with IntelliJ IDEA.
 * User: halil
 * Date: 28.06.2018 10:54
 */
var ApiDocumentation = require('api_documentation');

var defaultClient = ApiDocumentation.ApiClient.instance;
defaultClient.basePath = "http://localhost:8080";

console.log("defaultClient.basePath: " + defaultClient.basePath);

// Configure API key authorization: apiKey
var apiKey = defaultClient.authentications['apiKey'];
apiKey.apiKey = "YOUR API KEY"
// Uncomment the following line to set a prefix for the API key, e.g. "Token" (defaults to null)
//apiKey.apiKeyPrefix['Authorization'] = "Token"

var companyName = "browsymous";

var managedUser = function(login, password, companyName) {
    var managedUserVM = new ApiDocumentation.UserDTO(); // UserDTO | managedUserVM
    managedUserVM.login = login;
    managedUserVM.email = login;
    managedUserVM.password = password;
    managedUserVM.company = {"name": companyName};
    managedUserVM.authorities = ["ROLE_SUBSCRIBER"];

    return managedUserVM;
};
global.managedUserFunc = managedUser;
global.accountResourceApi = new ApiDocumentation.AccountResourceApi();


var startSubscription = function (subscriber, paymentCard, offer) {
    var startSubscriptionVM = new ApiDocumentation.StartSubscriptionRequest();
    startSubscriptionVM.subscriber = subscriber;
    startSubscriptionVM.paymentCard = paymentCard;
    startSubscriptionVM.offer = offer;

    return startSubscriptionVM;
}

global.startSubscriptionFunc = startSubscription();
global.subsriptionResourceApi = new ApiDocumentation.SubsriptionResourceApi();

var login = function(login, password) {
    var loginVM = new ApiDocumentation.LoginVM(); // UserDTO | managedUserVM
    loginVM.username = login;
    loginVM.password = password;
    loginVM.company = companyName;

    return loginVM;
};
global.loginFunc = login;
global.userJwtControllerApi = new ApiDocumentation.UserJwtControllerApi();

var isLoggedIn = function () {
    var token = localStorage.getItem("authenticationToken");
    return token != undefined && token !== null && token !== "";
};
global.isLoggedInFunc = isLoggedIn;

var logout = function () {
    localStorage.removeItem("authenticationToken");
};
global.logoutFunc = logout;

