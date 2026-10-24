// جاوااسکریپت محلی بسته — بدون هیچ درخواست شبکه (آفلاین)
(function () {
    "use strict";

    var clockEl = document.getElementById("clock");
    if (!clockEl) return;

    function pad(n) {
        return (n < 10 ? "0" : "") + n;
    }

    function tick() {
        var now = new Date();
        clockEl.textContent = pad(now.getHours()) + ":" + pad(now.getMinutes());
    }

    tick();
    setInterval(tick, 15000);
})();
