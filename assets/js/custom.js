function bodyOnLoad() {
    var loginSpan = document.getElementById("loginSpan");
    var logoutSpan = document.getElementById("logoutSpan");
    var profileSpan = document.getElementById("profileSpan");

    if (isLoggedInFunc()) {
        loginSpan.style.display = "none";
        logoutSpan.style.display = "block";
        profileSpan.style.display = "block";
    } else {
        loginSpan.style.display = "block";
        logoutSpan.style.display = "none";
        profileSpan.style.display = "none";
    }
}

function logout() {
    logoutFunc();
    location.reload();
}

var fetchOrderItems = function () {
    var items = localStorage.getItem("order-items");
    if (items === null)
        items = [];
    else
        items = JSON.parse(items);
    return items;
};