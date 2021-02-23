self.onInit = function() {

    var configObject = {
        maxDays: 30
    };

    $('#datePicker').dateRangePicker(configObject);

    var downloadButton = document.getElementById(
            "download"),
        reportButton = document.getElementById(
        "report");

    getDevices();

    downloadButton.onclick = function() {
        var action = "download"
        buttonClickAction(action);
    }

    reportButton.onclick = function() {
        var action = "generate report"
        buttonClickAction(action);
    }
}

self.onDestroy = function() {}

const buttonClickAction = function(action) {
    const http = self.ctx.http;

    var select = document.getElementById("select"),
        date = document.getElementById("datePicker");

    var deviceId = select.value,
        deviceName = select.options[select
            .selectedIndex].text

    var dates = date.value.split(' '),
        startDate = moment(dates[0] +
            ' 00:00:00'),
        endDate = moment(dates[2] +
            ' 23:59:59');

    var limit = (endDate / 1000) - (startDate /
        1000) + 1;

    if (!select.value || !date.value) {
        document.getElementById("user-interaction")
            .textContent =
            'Please select a device and date range.'
        return
    }

    $("#download").prop('disabled', true)
    $("#select").prop('disabled', true)
    $("#datePicker").prop('disabled', true)
    document.getElementById("user-interaction")
        .textContent = 'Processing...'

    // call data query api
    const result = http.get(
        '/api/plugins/telemetry/DEVICE/' +
        deviceId.toString() +
        '/values/timeseries?keys=data' +
        '&limit=' + limit + '&startTs=' +
        startDate + '&endTs=' + endDate, {
            headers: {
                'Content-type': 'application/json'
            }
        });

    if (action == "download") {
        result.forEach((data) => {
            downloadData(dataToCsv(data,
                    startDate,
                    endDate), deviceName,
                startDate, endDate);
        });
    }

    if (action == "generate report") {
        result.forEach((data) => {
            analyzeData(data)
        });
    }
}

const analyzeData = function(data) {

    for (i = data.data.length - 1; i >= 0; i--) {
        var value = formatJsonData(data.data[i].value)
        for (const key in value) {
            var variable = value[key].split(':')[0]
            if (variable == "SpO2") {
                // get value, analyze and store
            }
        }
    }
}

const dataToCsv = function(data, startDate, endDate) {
    const csvRows = [];

    // get headers and populate csvRows
    var headers = Object.keys(data.data[0])[0]
    var unformattedHeaders = data.data[0].value
    var additionalHeaders = formatJsonData(
        unformattedHeaders)
    for (const key in additionalHeaders) {
        newHeader = additionalHeaders[key].split(':')[0]
        headers += ',' + newHeader
    }

    csvRows.push(headers)

    // populate CSV with data
    for (i = data.data.length - 1; i >= 0; i--) {
        var newRow = moment(data.data[i].ts).format(
            'YYYY-MM-DD HH:mm:ss')
        var value = formatJsonData(data.data[i].value)
        for (const key in value) {
            var newValue = value[key].split(':')[1]
            newRow += ',' + newValue
        }
        csvRows.push(newRow)
    }

    return csvRows.join('\n')
}

const downloadData = function(data, deviceName, startDate,
    endDate) {

    const blob = new Blob([data], {
        type: 'text/csv'
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);

    // Setting document name
    startDate = moment(startDate).format('YYYY-MM-DD')
    endDate = moment(endDate).format('YYYY-MM-DD')
    documentName = String(deviceName) + '_' +
        startDate + '_to_' + endDate
    a.setAttribute('download', documentName + '.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Reset card
    $("#download").removeAttr('disabled')
    $("#select").removeAttr('disabled')
    $("#datePicker").removeAttr('disabled')
    document.getElementById("user-interaction")
        .textContent = ''
}

const getDevices = function() {
    const http = self.ctx.http;

    // Load multiple devices
    const deviceQuery = http.get(
        '/api/tenant/devices?pageSize=100&page=0');

    deviceQuery.forEach((devices) => {
        devices.data.forEach((device) => {
            const deviceName = String(
                    device.name),
                deviceId = String(device
                    .id.id)

            var option = document
                .createElement(
                    "option");
            option.value = deviceId;
            option.innerHTML =
                deviceName;
            select.appendChild(option);
        });
    });
}

const formatJsonData = function(valueString) {
    return valueString.replace(/"/g, '').replace(/{/g,
        '').replace(/}/g, '').split(',')
}