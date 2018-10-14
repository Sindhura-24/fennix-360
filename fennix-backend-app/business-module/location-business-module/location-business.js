const {arrayNotEmptyCheck, notNullCheck, objectHasPropertyCheck} = require('../../util-module/data-validators');
const {deviceCommandConstants} = require('../../util-module/device-command-constants');
const locationAccessor = require('../../repository-module/data-accesors/location-accesor');
const deviceAccessor = require('../../repository-module/data-accesors/device-accesor');
const containerAccessor = require('../../repository-module/data-accesors/container-accessor');
const {deviceValidator} = require('../../util-module/device-validations');


let locationObj = {}, deviceObj = {};
const locationUpdateBusiness = async (data) => {
    let returnString = '';
    if (data.indexOf(deviceCommandConstants.cmdLogin) !== -1) {  // '#SA'
        returnString = processData(data);
    } else if (data.indexOf(deviceCommandConstants.cmdLocationReport) !== -1) {  // '#RD

        await processLocation(data);
    }
    return returnString;
};

const processData = (loginString) => {
    let returnString, loginFlag;
    const checkSum = 3;
    const dataCommand = loginString.substr(0, 3);
    locationObj = {
        connectionSession: loginString.substr(3, 6),
        serialNumber: loginString.substr(9, 5),
    };
    const loginHome = dataCommand.length + locationObj.connectionSession.length + locationObj.serialNumber.length + loginString.substr(14, 15).length;
    deviceObj = {
        imei: loginString.substr(14, 15),
        firmwareVersion: loginString.substr(loginHome, (loginString.length - 1) - (loginHome - 1) - checkSum)
    };
    loginFlag = processLogin(loginString.substr(14, 15));
    returnString = loginFlag ? loginString.replace(loginString.substr(0, 3), deviceCommandConstants.cmdLoginResponse) : loginString; // '#SB'
    return returnString;
};

const processLocation = async (location) => {
    let ticketResponse;
    let locationObj = {}, latitude, longitude;
    const NudosToKm = 1.852;
    const direction = 6;
    let day = location.substr(29, 2);
    let month = parseInt(location.substr(31, 2)) - 1;
    let year = `20${location.substr(33, 2)}`;
    let hours = location.substr(35, 2);
    let minutes = location.substr(37, 2);
    let seconds = location.substr(39, 2);
    let dateTime = new Date(year, month, day, hours, minutes, seconds);
    let beneficiaryResponse = await deviceAccessor.getBeneficiaryIdByImeiAccessor(parseInt(location.substr(14, 15)));
    if (arrayNotEmptyCheck(beneficiaryResponse) && notNullCheck(beneficiaryResponse[0]) && notNullCheck(beneficiaryResponse[0]['beneficiaryId'])) {
        let masterRequest = {
            deviceId: parseInt(beneficiaryResponse[0]['_id']),
            beneficiaryId: parseInt(beneficiaryResponse[0]['beneficiaryId'])
        };
        const vel = location.substr(62, 5);
        let deviceAttribute = {
            beneficiaryId: parseInt(beneficiaryResponse[0]['beneficiaryId']),
            serialNumber: location.substr(9, 5),
            hdop: location.substr(99, 2),
            cellId: location.substr(108, 4),
            mcc: location.substr(101, 3),
            lac: location.substr(104, 4),
            serverDate: new Date(),
            speed: ((parseInt(vel.substr(0, 3), 10) + parseFloat(vel.substr(4, 1)) / 10) * NudosToKm).toFixed(2),
            course: parseInt(location.substr(67, 2)) * direction,
            moveDistance: parseInt(location.substr(69, 5)),
            gpsStatus: location.substr(74, 1),
            alarmStatus: location.substr(75, 21),
            ...alarmStatusDeCompiler(location.substr(75, 21)),
            satellitesNumber: location.substr(96, 2),
            deviceUpdatedDate: dateTime,
            gpsFixedStatus: location.substr(98, 1)
        };
        let lat = location.substr(41, 10);
        let signLat = lat.indexOf('N') !== -1 ? 1 : -1;
        latitude = signLat * getValue(lat.substr(0, 2), lat.substr(2, 2), lat.substr(5, 4));
        let lng = location.substr(51, 11);
        let signLng = lng.indexOf('E') !== -1 ? 1 : -1;
        longitude = signLng * getValue(lng.substr(0, 3), lng.substr(3, 2), lng.substr(6, 4));
        locationObj = {
            longitude: longitude,
            latitude: latitude,
            beneficiaryId: parseInt(beneficiaryResponse[0]['beneficiaryId']),
            deviceDate: dateTime
        };
        const locationId = await locationAccessor.updateLocation(locationObj);
        ticketResponse = deviceValidator(deviceAttribute, masterRequest.beneficiaryId, locationObj);
        // console.log(ticketResponse);
        // if (notNullCheck(ticketResponse)) {
        //     addAutomatedTicketBusiness(ticketResponse, masterRequest.beneficiaryId);
        // }
        deviceAttribute = {...deviceAttribute, locationId: locationId['_doc']['counter']};
        const deviceAttributeId = await deviceAccessor.updateDeviceAttributesAccessor(deviceAttribute);
        masterRequest = {
            ...masterRequest,
            locationId: parseInt(locationId['_doc']['counter']),
            deviceAttributeId: parseInt(deviceAttributeId['_doc']['counter'])
        };
        await deviceAccessor.updateLocationDeviceAttributeMasterAccessor(masterRequest).then((doc) => {
            // console.log(doc)
        });
    }
};

processLogin = async (imei) => {
    let returnFlag, beneficiaryResponse = await deviceAccessor.getBeneficiaryIdByImeiAccessor(parseInt(imei));
    console.log('Beneficiary details:');
    console.log(beneficiaryResponse);
    returnFlag = arrayNotEmptyCheck(beneficiaryResponse);
    return returnFlag;
};

const getValue = (intPart, decimalPart1, decimalPart2) => {
    let ret = 0;
    ret = parseFloat(intPart);
    ret += parseFloat(decimalPart1) / 60;
    ret += parseFloat(decimalPart2) / (60 * 10000);
    return ret;
};

const alarmStatusDeCompiler = (alarmStatus) => {
    return {
        beltStatus: alarmStatus.substr(0, 1),
        shellStatus: alarmStatus.substr(1, 1),
        gsmSignal: getGSMLevel(parseInt(alarmStatus.substr(2, 2))),
        batteryVoltage: (parseInt(alarmStatus.substr(4, 1)) + (parseInt(alarmStatus.substr(5, 2)) / 100)).toFixed(2),
        batteryPercentage: batteryPercentCalculator(parseInt(alarmStatus.substr(4, 1)) + (parseInt(alarmStatus.substr(5, 2)) / 100)).toFixed(2),
        chargeStatus: alarmStatus.substr(7, 1),
        lowPowerStatus: alarmStatus.substr(8, 1),
        dataLoggerStatus: alarmStatus.substr(9, 1),
        stillStatus: alarmStatus.substr(10, 1),
        enableAlarmsStatus: parseInt(alarmStatus.substr(11, 1)) === 1,
        buzzerStatus: parseInt(alarmStatus.substr(12, 1)) === 1,
        vibratorStatus: parseInt(alarmStatus.substr(13, 1)) === 1,
        rfConnectionStatus: alarmStatus.substr(14, 1),
        rfgSensorStatus: alarmStatus.substr(15, 1),
        rfPlugStatus: alarmStatus.substr(16, 1)
    };
};

const batteryPercentCalculator = (batteryVoltage) => {
    const perc = [0, 9, 15, 20, 100];
    const volts = [3.4, 3.46, 3.55, 3.6, 4.1];
    let ret = 0, dvRange, dvMeasure, dpRange, vSelected = 0;
    for (let v = 0; v < volts.length; v++) {
        if (batteryVoltage > volts[v]) {
            vSelected = v;
        } else {
            break;
        }
    }
    if (vSelected === 0) {
        ret = 0;
    } else if (vSelected > 0 && vSelected < volts.length - 1) {
        dvRange = volts[vSelected + 1] - volts[vSelected];
        dvMeasure = batteryVoltage - volts[vSelected];
        dpRange = perc[vSelected + 1] - perc[vSelected];
        ret = perc[vSelected] + ((dvMeasure * dpRange) / dvRange);
    }
    else if (vSelected === (volts.length - 1)) {
        ret = 100;
    }
    return ret;
};

const getGSMLevel = (gsmStatus) => {
    let gsmLevel;
    if (gsmStatus < 4 || gsmStatus === 99) {
        gsmLevel = 0;
    } else if (4 < gsmStatus < 10) {
        gsmLevel = 1;
    } else if (10 < gsmStatus < 16) {
        gsmLevel = 2;
    } else if (16 < gsmStatus < 22) {
        gsmLevel = 3;
    } else if (22 < gsmStatus < 28) {
        gsmLevel = 4;
    } else if (28 < gsmStatus) {
        gsmLevel = 5;
    }
    return gsmLevel;
};
//
// const dataSplitter = async (data) => {
//     let deviceId, datalength, deviceAlertInfo, deviceType, protocol, deviceStatus, date, returnString = '',
//         location = {},
//         deviceAttributes = {};
//     deviceAlertInfo = await hexToBinary(data.slice(72, 76));
//     deviceId = data.slice(2, 12);//device Id
//     console.log(deviceId);
//     protocol = data.slice(12, 14);// 17 being the protocol
//     console.log(protocol);
//     deviceType = data.slice(14, 15);// 1 being rechargeable
//     console.log(deviceType);
//     deviceStatus = data.slice(15, 16);// data type
//     console.log(deviceStatus);
//     datalength = data.slice(16, 20);
//     date = data.slice(20, 26);// data length
//     console.log(date);
//     let time = data.slice(26, 32);// time length
//     const containerResponse = await containerAccessor.getContainerForDeviceIdAccessor(deviceId);
//     if (containerResponse && objectHasPropertyCheck(containerResponse, 'rows') && arrayNotEmptyCheck(containerResponse['rows'])) {
//         location = {
//             containerId: containerResponse['rows'][0]['container_id'],
//             deviceId: deviceId,
//             lat: degreeConverter(data.slice(32, 40), hexToBinary(data.slice(49, 50))),
//             lng: degreeConverter(data.slice(40, 49), hexToBinary(data.slice(49, 50)))
//         };
//         console.log(location);
//         deviceAttributes = {
//             containerId: containerResponse['rows'][0]['container_id'],
//             deviceId: deviceId,
//             gps: data.slice(49, 50),
//             speed: data.slice(50, 52),
//             direction: data.slice(52, 54),
//             mileage: data.slice(54, 62),
//             gpsQuality: data.slice(62, 64),
//             vehicleId: data.slice(64, 72),
//             deviceStatus: deviceAlertInfo.returnValue,
//             serverDate: new Date(),
//             deviceUpdatedDate: new Date(),
//             batteryPercentage: data.slice(76, 78),
//             cellId: data.slice(78, 82),
//             LAC: data.slice(82, 86),
//             gsmQuality: data.slice(86, 88),
//             geoFenceAlarm: data.slice(88, 90)
//         };
//         if (deviceAlertInfo.flag && deviceAlertInfo.returnValue.split('')[14] === '1') {
//             returnString = '(P35)';
//         }
//         // const updateLoc = await containerAccessor.containerLocationUpdateAccessor(location);
//         // const updateDeviceAttr = await containerAccessor.containerDeviceUpdateAccessor(deviceAttributes);
//         // console.log(updateLoc);
//         // console.log(updateDeviceAttr);
//     }
//     console.log(deviceAttributes);
//     return returnString;
// };

const eLocksDataUpdateBusiness = async (data) => {
    let returnString = '', returnValue,returnArray;
    console.log('##########################');
    console.log(data);
    // data = 2478605036401713002714051703391022348647113549984f0000000000000c0000000000205f0000000708000f0f0f0e2478605036401712002714051703392022348648113549999f0000000000000c0000000010205f0000000708000f0f0f022478605036401713002714051703394022348646113550014f0000000000000c0000000000205f000000070c000f0f0f0f2478605036401713002714051703401022348644113550027f0000000000000c0000000000205f0000000716000f0f0f102478605036401713002714051703411022348644113550037f0000000000000c002c000000205f0000000700000f0f0f122478605036401713002714051703414022348651113550039f0000000000000c0000000000205f000000070c000f0f0f132478605036401713002714051703424600000000000000000e000000000000000000000000a05f0000000100000f0f0f002478605036401712002714051703424800000000000000000e000000000000000000000001205f0000000300000f0f0f002478605036401712002714051703424900000000000000000e000000000000000000000010205f0000000400000f0f0f012478605036401713002714051703431700000000000000000e000000000000000000000000205f000000070b000f0f0f01;
    const eLockStatus = data.slice(0, 2);
    switch (parseInt(eLockStatus, 10)) {
        case 24:
            returnArray = dataIterator(data,{});
            // dataInput = returnArray.gps()
            break;
        case 28:
            returnString = '(P46)';

    }

    // switch (parseInt(eLockStatus, 10)) {
    //     case 24:
    //         if (data.length < 93) {
    //             returnString = await dataSplitter(data);
    //         } else {
    //             returnValue = await dataIterator(data);
    //             console.log(returnValue);
    //             if (returnValue.alarm.length === 0) {
    //                 returnString = await dataSplitter(returnValue.gps);
    //             } else {
    //                 returnString = '(P35)';
    //             }
    //         }
    //         break;
    //     case 28:
    //         returnString = '(P46)';
    // }
    // return returnString;
        };

const degreeConverter = async (minuteData, direction) => {
    let degree, minute, total, loc;
    if (minuteData.length === 8) {
        degree = minuteData.slice(0, 2);
        minute = (parseFloat('' + minuteData.slice(2, 4) + '.' + minuteData.slice(4, 8))) / 60;
        total = degree + minute;
        if (direction.toString() === '1111' || direction.toString() === '1110') {
            loc = '' + total + 'W';
        } else {
            loc = direction[2] === 1 ? '' + total + 'E' : '' + total + 'W';
        }
    } else {
        degree = minuteData.slice(0, 3);
        minute = (parseFloat('' + minuteData.slice(3, 5) + '.' + minuteData.slice(5, 9))) / 60;
        total = degree + minute;
        if (direction.toString() === '1111' || direction.toString() === '1110') {
            loc = '' + total + 'N';
        } else {
            loc = direction[2] === 1 ? '' + total + 'N' : '' + total + 'S';
        }
    }
    return loc;
};

const dataIterator = (data, obj) => {
    if (!obj) {
        obj = {
            gps: [],
            alarm: [],
            others: []
        }
    }
    if (data.length > 0) {
        switch (parseInt(data.slice(0, 2))) {
            case 24:
                const gpsArray = [];
                gpsArray.push(data.splice(0, 93));
                obj.gps.push(gpsArray);
                break;
            case 28:
                const alarmArray = [];
                alarmArray.push(data.splice(0, 32));
                obj.alarm.push(alarmArray);
                break;
            default:
        }
        if (data.length > 0) {
            dataIterator(data, obj);
        } else {
            return obj;
        }
    }
};

const hexToBinary = async (deviceStatus) => {
    let ret = '', returnValue = {flag: false, returnArray: ''},
        lookupTable = {
            '0': '0000', '1': '0001', '2': '0010', '3': '0011', '4': '0100',
            '5': '0101', '6': '0110', '7': '0111', '8': '1000', '9': '1001',
            'a': '1010', 'b': '1011', 'c': '1100', 'd': '1101',
            'e': '1110', 'f': '1111',
            'A': '1010', 'B': '1011', 'C': '1100', 'D': '1101',
            'E': '1110', 'F': '1111'
        };
    // lookup table for easier conversion. '0' characters are padded for '1' to '7'
    for (let i = 0; i < deviceStatus.length; i += 1) {
        if (lookupTable.hasOwnProperty(deviceStatus[i])) {
            ret += lookupTable[deviceStatus[i]];
        }
    }
    returnValue.flag = ret.length === 16;
    returnValue.returnArray = ret;
    return returnValue;
};

module.exports = {
    locationUpdateBusiness,
    eLocksDataUpdateBusiness
};