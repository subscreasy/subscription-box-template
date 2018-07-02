function bodyOnLoad() {
    var loginSpan = document.getElementById("loginSpan");
    var logoutSpan = document.getElementById("logoutSpan");

    if (isLoggedInFunc()) {
        loginSpan.style.display = "none";
        logoutSpan.style.display = "block";
    } else {
        loginSpan.style.display = "block";
        logoutSpan.style.display = "none";
    }
}

function logout() {
    logoutFunc();
    location.reload();
}