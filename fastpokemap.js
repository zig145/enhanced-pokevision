javascript:{
    
var autoScanThread;
var observedScanRadius = 70;
var lastScanIndex = -1;
var scanCircles = [];

var checkPokemonThread;
var pokemonRegistry = [];
var pokemonCount = {};
var notifyCircle;

var autoScanFreq = localStorage.getItem("autoScanFreq");
if (!autoScanFreq) autoScanFreq = 30;

var scanPoints = JSON.parse(localStorage.getItem("scanPoints"));
if (!scanPoints) scanPoints = [
    {deg: 0, dist: 0},
    {deg: 0, dist: 216.5},
    {deg: 60, dist: 216.5},
    {deg: 120, dist: 216.5},
    {deg: 180, dist: 216.5},
    {deg: 240, dist: 216.5},
    {deg: 300, dist: 216.5}
];

var pushBulletKey = localStorage.getItem("pushBulletKey");
if (!pushBulletKey) pushBulletKey = "";

var maxNotifyDistance = localStorage.getItem("maxNotifyDistance");
if (!maxNotifyDistance) maxNotifyDistance = "250";

var notifyFilter = localStorage.getItem("notifyFilter");
if (!notifyFilter) notifyFilter = "|";

function z_loadContent() {
    var styles = `
    <style>
#z_contentContainer {
    position: absolute;
    top: 20px;
    left: 220px;
    z-index: 5;
}

.z_toggle {
    margin-left: 20px;
    padding-left: 30px;
    background: url('images/toggle_off.png') no-repeat;
    cursor: pointer;
}

.z_toggle.on {
    background: url('images/toggle_on.png') no-repeat;
}

#openSettings {
    margin-left: 30px;
    cursor: pointer;
}

#z_overlay {
    position: absolute;
    height: 100%;
    width: 100%;
    top: 0;
    left: 0;
    z-index: 500;
    background-color: #666;
    opacity: .5;
    visibility: hidden;
}

#z_overlay.on {
    visibility: visible;
}

#z_settings {
    position: absolute;
    height: 925px;
    width: 530px;
    top: 20px;
    left: 50%;
    margin-left: -265px;
    z-index: 600;
    border: 1px solid black;
    background-color: #DDF;
    padding: 25px;
    visibility: hidden;
}

#z_settings.on {
    visibility: visible;
}

#autoScanFreq {
    width: 50px;
}

#scanPoints {
    width: 475px;
}

#pushBulletKey {
    width: 300px;
}

#maxNotifyDistance {
    width: 50px;
}

.z_filterIcon {
    cursor : pointer;
    border: 1px solid black;
    border-radius : 8px;
    height: 36px;
    width: 36px;
    vertical-align: baseline;
    background-color: white;
}

.z_filterIcon.selected {
    background-color : #888;
    opacity: .4;
}
    </style>
    `;
    $("head").append(styles);

    var content = `
        <div id="z_contentContainer">
            <a class="z_toggle autoScan">Auto Scan</a>
            <a class="z_toggle notify">Notifications</a>
            <a id="openSettings">Settings</a>
        </div>
        <div id="z_settings">
            <p><b>Auto Scan Frequency (seconds):</b><br><input id="autoScanFreq" type="text" value="` + autoScanFreq + `" /></p>
            <p><b>Scan Points:</b><br><input id="scanPoints" type="text" value='` + JSON.stringify(scanPoints) + `' /></p>
            <p><b>Pushbullet Auth Key:</b><br><input id="pushBulletKey" type="text" value="` + pushBulletKey + `" /></p>
            <p><b>Notification Radius (meters):</b><br><input id="maxNotifyDistance" type="text" value="` + maxNotifyDistance + `" /></p>
            <p><b>Notification Filter:</b><br>
    `;

    for (var i = 1; i <= 151; i++ ) {
        content += `
            <img src="https://ugc.pokevision.com/images/pokemon/` + i + `.png" title="` + pokemonNames[i] + `" alt="` + i + `" class="z_filterIcon` + (isFilteredForNotify(i) ? " selected" : "") + `" />
        `;
    }

    content += `
            <p><button id="saveSettings">Save and Close</button></p>
        </div>
        <div id="z_overlay"></div>
    `;

    $("body").append(content);

    $(".z_toggle.autoScan").click(function () {
        $(this).toggleClass("on");
        if ($(this).hasClass("on")) {
            console.log("Starting Auto Scan");
            autoScan();
            drawScanCircles();
        } else {
            console.log("Stoping Auto Scan");
            clearTimeout(autoScanThread);
            removeScanCircles();
        }
    });

    $(".z_toggle.notify").click(function () {
        $(this).toggleClass("on");
        if ($(this).hasClass("on")) {
            console.log("Starting Notifications");
            checkForUnregisteredPokemon();
            notifyCircle.addTo(map);
        } else {
            console.log("Stoping Notifications");
            clearTimeout(checkPokemonThread);
            map.removeLayer(notifyCircle);
        }
    });

    $(".z_filterIcon").click(function () {
        var pokemonId = this.alt;
        $(this).toggleClass("selected");
        if ($(this).hasClass("selected")) {
            notifyFilter += pokemonId + "|";
        } else {
            notifyFilter = notifyFilter.replace("|" + pokemonId + "|", "|");
        }
    });

    $("#openSettings").click(function () {
        $("#z_settings").toggleClass("on");
        $("#z_overlay").toggleClass("on");
    });

    $("#saveSettings").click(function () {
        $("#z_settings").toggleClass("on");
        $("#z_overlay").toggleClass("on");
        persistSettings();
    });

    notifyCircle = L.circle([marker.getLatLng().lat, marker.getLatLng().lng], maxNotifyDistance, {fill: false, color: "#F00", dashArray: "1, 12"});
    createScanCircles();

    map.on('click', function(t) {
        notifyCircle.setLatLng(t.latlng);
        moveScanCircles(t.latlng);
    });
}
z_loadContent();

function autoScan() {
    console.log("Scanning...");

    setScanCircleColor(lastScanIndex, "#999");

    lastScanIndex += 1;
    if (lastScanIndex >= scanCircles.length) lastScanIndex = 0;

    setScanCircleColor(lastScanIndex, "#99D");

    var latLng = scanCircles[lastScanIndex].getLatLng();
    getPokemon(latLng.lat, latLng.lng);
    loadCache(latLng);
    autoScanThread = setTimeout(autoScan, autoScanFreq * 1000);
}

function createScanCircles() {
    var autoScanOn = $(".z_toggle.autoScan").hasClass("on");
    if (autoScanOn) removeScanCircles();
    scanCircles = [];
    for (var i = 0; i < scanPoints.length; i++) {
        var latLng = calculateCoords({lat: marker.getLatLng().lat, lng: marker.getLatLng().lng}, scanPoints[i].deg, scanPoints[i].dist);
        scanCircles.push(L.circle(latLng, observedScanRadius, {color: "#999"}));
    }
    if (autoScanOn) drawScanCircles();
}

function drawScanCircles() {
    for (var i = 0; i < scanCircles.length; i++) {
        scanCircles[i].addTo(map);
    }
}

function removeScanCircles() {
    for (var i = 0; i < scanCircles.length; i++) {
        map.removeLayer(scanCircles[i]);
    }
}

function moveScanCircles(newOrigin) {
    setScanCircleColor(lastScanIndex, "#999");
    for (var i = 0; i < scanPoints.length; i++) {
        var latLng = calculateCoords(newOrigin, scanPoints[i].deg, scanPoints[i].dist);
        scanCircles[i].setLatLng(latLng);
    }
    lastScanIndex = -1;
}

function setScanCircleColor(index, color) {
    if (scanCircles[index]) {
        scanCircles[index].setStyle({color: color});
    }
}

function checkForUnregisteredPokemon() {
    console.log("Checking for unregistered pokemon...");
    for(var i in shownMarker) {
        var pokemon = shownMarker[i];
        if (pokemon.active && !registryContains(pokemon)) {
            processUnregisteredPokemon(pokemon);
        }
    }
    checkPokemonThread = setTimeout(checkForUnregisteredPokemon, 5000);
}

function registryContains(pokemon) {
    for (var i = this.pokemonRegistry.length - 1; i >= 0; i--) {
        var registeredPokemon = this.pokemonRegistry[i];
        if (pokemon.id === registeredPokemon.id) {
            return true;
        } else if (registeredPokemon.expire < (Date.now())) {
            this.pokemonRegistry.splice(i, 1);
        }
    }
    return false;
}

function incrementPokemonCount(pokemonId) {
    if (pokemonCount[pokemonId]) pokemonCount[pokemonId]++;
    else pokemonCount[pokemonId] = 1;
}

function report() {
    var totalPokemon = 0;
    var reportItems = [];
    for (var pokemonId in pokemonCount) {
        totalPokemon += pokemonCount[pokemonId];
        reportItems.push({name: pokemonNames[pokemonId], count: pokemonCount[pokemonId]})
    }
    reportItems.sort(function(a, b) {
        return b.count - a.count;
    });
    console.log(totalPokemon + " total pokemon found!");
    for (var i = 0; i < reportItems.length; i++) {
        console.log(reportItems[i].name + " :: " + reportItems[i].count + " :: " + (reportItems[i].count / totalPokemon * 100).toFixed(1) + "%");
    }
}

function processUnregisteredPokemon(pokemon) {
    var pokemonLat = pokemon.marker.getLatLng().lat;
    var pokemonLng = pokemon.marker.getLatLng().lng;
    var distance = calculateDistance(marker.getLatLng().lat, pokemonLat, marker.getLatLng().lng, pokemonLng);
    if (distance > maxNotifyDistance) return;

    var pokemonId = pokemon.marker.options.icon.options.pokemonid;
    if (!isFilteredForNotify(pokemonId)) {
        console.log(pokemon);
        var title = pokemonNames[pokemonId] + " :: " + formatTime(pokemon.expire);
        var body = "https://www.google.com/maps/@" + pokemonLat + "," + pokemonLng + ",19z";
        sendNotification(title, body);
    }

    incrementPokemonCount(pokemon.pokemonId);
    pokemonRegistry.push(pokemon);
}

function isFilteredForNotify(pokemonId) {
    if (notifyFilter.indexOf("|" + pokemonId + "|") >= 0) {
        return true;
    } else {
        return false;
    }
}

function sendNotification(title, body) {
    console.log("Sending notification :: " + title + " :: " + body);
    $.ajax({
        url: "https://api.pushbullet.com/v2/pushes",
        type: 'post',
        headers: {
            "Access-Token": pushBulletKey,
            "Content-Type": "application/json"
        },
        data: '{"body":"' + body + '","title":"' + title + '","type":"note"}',
        dataType: 'json',
        success: function(data) {
            console.log("Notify Success");
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.log("Notify Error");
        }
    })
}

function formatTime(time) {
    var date = new Date(parseInt(time));
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0'+minutes : minutes;
    return hours + ':' + minutes + ' ' + ampm;
}

function calculateDistance(lat1, lat2, lon1, lon2) {
    var R = 6371e3;
    var deltaLat = (lat2-lat1) * Math.PI / 180;
    var deltaLon = ((lon2-lon1) * Math.PI / 180) * Math.cos((lat2 + lat1) / 2 * Math.PI / 180);
    return R * Math.sqrt((deltaLat * deltaLat) + (deltaLon * deltaLon));
}

function calculateCoords(latLng, degrees, numMeters) {
    var R = 6371e3;
    var heading = degrees * Math.PI / 180;
    var deltaLat = numMeters / R * Math.sin(heading);
    var lat = (deltaLat / Math.PI * 180) + latLng.lat;
    var deltaLon = numMeters / R * Math.cos(heading);
    var lng = (deltaLon / Math.cos((lat + latLng.lat) / 2 * Math.PI / 180) / Math.PI * 180) + latLng.lng;
    return {lat: lat, lng: lng};
}

function persistSettings() {
    autoScanFreq = $("#autoScanFreq").val();
    localStorage.setItem("autoScanFreq", autoScanFreq);

    var sScanPoints = $("#scanPoints").val();
    var aScanPoints = JSON.parse(sScanPoints);
    scanPoints = aScanPoints;
    localStorage.setItem("scanPoints", sScanPoints);
    createScanCircles();
    lastScanIndex = -1;

    pushBulletKey = $("#pushBulletKey").val();
    localStorage.setItem("pushBulletKey", pushBulletKey);

    maxNotifyDistance = $("#maxNotifyDistance").val();
    localStorage.setItem("maxNotifyDistance", maxNotifyDistance);
    notifyCircle.setRadius(maxNotifyDistance);

    localStorage.setItem("notifyFilter", notifyFilter);
}

};void(0);