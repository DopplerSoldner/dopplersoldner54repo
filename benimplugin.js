import serial from "@SignalRGB/serial";

export function Name() { return "Skydimo LED Strip"; }
export function VendorId() { return 0x1A86; }
export function ProductId() { return [0x7523]; }
export function Publisher() { return "I'm Not MentaL"; }
export function Documentation() { return "troubleshooting/skydimo"; }
export function Type() { return "serial"; }
export function DeviceType() { return "lightingcontroller"; }
export function SubdeviceController() { return true; }

/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/

export function ControllableParameters() {
    return [
        { property: "shutdownColor", group: "lighting", label: "Shutdown Color", description: "This color is applied to the device when the System, or SignalRGB is shutting down", min: "0", max: "360", type: "color", default: "#000000" },
        { property: "LightingMode", group: "lighting", label: "Lighting Mode", description: "Determines where the device's RGB comes from. Canvas will pull from the active Effect, while Forced will override it to a specific color", type: "combobox", values: ["Canvas", "Forced"], default: "Canvas" },
        { property: "forcedColor", group: "lighting", label: "Forced Color", description: "The color used when 'Forced' Lighting Mode is enabled", min: "0", max: "360", type: "color", default: "#009bde" },
    ];
}

let skydimoPortName = null;
let skydimoModel = null;
let skydimoInfoRead = false;

let lastReconnectAttempt = 0;
const RECONNECT_INTERVAL = 5000;
const POST_CONNECT_STABILIZE_MS = 1500;
const DEVICE_INFO_PAUSE_MS = 2500;
const DEVICE_INFO_READ_TIMEOUT_MS = 3000;

const deviceConfig = {
    "SK0201": { layout: 2, zones: [20, 20], total: 40, image: "SK02" },
    "SK0202": { layout: 2, zones: [30, 30], total: 60, image: "SK02" },
    "SK0204": { layout: 2, zones: [25, 25], total: 50, image: "SK02" },
    "SK0F01": { layout: 2, zones: [29, 29], total: 58, image: "SK0F" },
    "SK0F02": { layout: 2, zones: [25, 25], total: 50, image: "SK0F" },

    "SK0121": { layout: 3, zones: [13, 25, 13], total: 51, image: "SK01" },
    "SK0124": { layout: 3, zones: [14, 26, 14], total: 54, image: "SK01" },
    "SK0127": { layout: 3, zones: [17, 31, 17], total: 65, image: "SK01" },
    "SK0132": { layout: 3, zones: [20, 37, 20], total: 77, image: "SK01" },
    "SK0134": { layout: 3, zones: [15, 41, 15], total: 71, image: "SK01" },
    "SK0149": { layout: 3, zones: [19, 69, 19], total: 107, image: "SK01" },

    "SK0L21": { layout: 4, zones: [13, 25, 13, 25], total: 76, image: "SK0L" },
    "SK0L24": { layout: 4, zones: [14, 26, 14, 26], total: 80, image: "SK0L" },
    "SK0L27": { layout: 4, zones: [17, 31, 17, 31], total: 96, image: "SK0L" },
    "SK0L32": { layout: 4, zones: [20, 37, 20, 37], total: 114, image: "SK0L" },
    "SK0L34": { layout: 4, zones: [15, 41, 15, 41], total: 112, image: "SK0L" },

    "SKA124": { layout: 3, zones: [18, 34, 18], total: 70, image: "SKA1" },
    "SKA127": { layout: 3, zones: [20, 41, 20], total: 81, image: "SKA1" },
    "SKA132": { layout: 3, zones: [25, 45, 25], total: 95, image: "SKA1" },
    "SKA134": { layout: 3, zones: [21, 51, 21], total: 93, image: "SKA1" },

    "SK0402": { layout: 1, zones: [72], total: 72, image: "SK04" },
    "SK0403": { layout: 1, zones: [96], total: 96, image: "SK04" },
    "SK0404": { layout: 1, zones: [144], total: 144, image: "SK04" },
    "SK0901": { layout: 1, zones: [14], total: 14, image: "SK09" },
    "SK0801": { layout: 1, zones: [2], total: 2, image: "SK08" },
    "SK0803": { layout: 1, zones: [10], total: 10, image: "SK08" },
    "SK0E01": { layout: 1, zones: [16], total: 16, image: "SK0E" },
    "SK0H01": { layout: 1, zones: [2], total: 2, image: "SK0H" },
    "SK0H02": { layout: 1, zones: [4], total: 4, image: "SK0H" },
    "SK0S01": { layout: 1, zones: [32], total: 32, image: "SK0J" },
    "SK0J01": { layout: 1, zones: [120], total: 120, image: "SK0J01" },
    "SK0K01": { layout: 1, zones: [120], total: 120, image: "SK0J" },
    "SK0K02": { layout: 1, zones: [15], total: 15, image: "SK0J" },
    "SK0M01": { layout: 1, zones: [24], total: 24, image: "SK0M" },
    "SK0N01": { layout: 1, zones: [256], total: 256, image: "SK0J" },
    "SK0N02": { layout: 1, zones: [1024], total: 1024, image: "SK0J" },
    "SK0N03": { layout: 1, zones: [253], total: 253, image: "SK0N03" }
};

export function ImageUrl() {
    if (skydimoModel && deviceConfig[skydimoModel]) {
        return getDeviceImage(deviceConfig[skydimoModel].image);
    }
    return "https://dev-dl.skydimo.com/assets/device/SK0J.jpg";
}

export function Initialize() {
    const ports = serial.availablePorts();
    if (!ports.length) {
        console.log("No serial ports detected.");
        return;
    }

    skydimoPortName = ports.find(p =>
        p.vendorId === 0x1A86 && p.productId === 0x7523
    )?.portName;

    if (!skydimoPortName) {
        console.log("Skydimo device not found.");
        return;
    }

    connectToSkydimo();
}

export function Render() {
    if (!skydimoPortName) return;

    if (!serial.isConnected()) {
        const now = Date.now();
        if (now - lastReconnectAttempt > RECONNECT_INTERVAL) {
            lastReconnectAttempt = now;
            console.log("Serial disconnected, retrying reconnect...");
            connectToSkydimo();
        }
        return;
    }

    if (!skydimoInfoRead) {
        return;
    }

    sendColors();
}

export function Shutdown(SystemSuspending) {
    if (!skydimoPortName) return;

    const color = SystemSuspending ? "#000000" : shutdownColor;
    sendColors(color);
    disconnect();
}

function connectToSkydimo() {
    if (!skydimoPortName) return false;
    if (serial.isConnected()) return true;

    const connected = serial.connect({
        portName: skydimoPortName,
        baudRate: 115200,
        parity: "None",
        dataBits: 8,
        stopBits: "One"
    });

    if (!connected) {
        console.log("Failed to connect to Skydimo.");
        return false;
    }

    console.log("Connected to Skydimo on port", skydimoPortName);
    device.pause(POST_CONNECT_STABILIZE_MS);

    const info = serial.getDeviceInfo(skydimoPortName);
    console.log("Device Info:", info);

    skydimoInfoRead = getDeviceInfo();

    if (!skydimoInfoRead) {
        console.log("Failed to read Skydimo model info after connect.");
    }

    return true;
}

function disconnect() {
    if (serial.isConnected()) {
        serial.disconnect();
        console.log("Disconnected from serial port");
    }
}

function sendColors(overrideColor) {
    if (!skydimoPortName) return;
    if (!serial.isConnected()) return;
    if (!skydimoInfoRead) return;
    if (!skydimoModel || !deviceConfig[skydimoModel]) return;

    const RGBData = [];
    const config = deviceConfig[skydimoModel];
    const count = config.total - 1;

    for (let i = 0; i < config.layout; i++) {
        RGBData.push(getZoneColors(i + 1, config.zones[i], overrideColor));
    }

    const mergedRGBData = [].concat.apply([], RGBData);
    const header = [0x41, 0x64, 0x61, 0x00, (count >> 8) & 0xFF, count & 0xFF];
    const packet = [...header, ...mergedRGBData];
    const success = serial.write(packet);

    if (!success) {
        console.error("Failed to write LED colors");
    }
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [0, 0, 0];

    return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ];
}

function getDeviceInfo() {
    if (!skydimoPortName || !serial.isConnected()) {
        return false;
    }

    const cmd = "Moni-A";
    const bytes = Array.from(cmd).map(c => c.charCodeAt(0));
    const writeOk = serial.write(bytes);

    if (!writeOk) {
        console.log("Failed to send Moni-A command.");
        return false;
    }

    device.pause(DEVICE_INFO_PAUSE_MS);

    const buf = serial.read(64, DEVICE_INFO_READ_TIMEOUT_MS);
    if (!buf || buf.length === 0) {
        console.log("No response from Skydimo device.");
        return false;
    }

    const response = String.fromCharCode(...buf).trim();
    device.log("Raw response:", response);

    const commaPos = response.indexOf(",");
    if (commaPos === -1) {
        device.log("Unexpected Skydimo response format:", response);
        return false;
    }

    const model = response.substring(0, commaPos).trim();
    const serialRaw = response.substring(commaPos + 1).trim();

    let deviceName = "Skydimo";
    let deviceSerial = "000000";

    if (model) {
        skydimoModel = model;
        deviceName = "Skydimo " + model;

        const devConfig = deviceConfig[model];
        if (!devConfig) {
            device.log(`No configuration found for model: ${model}`);
            return false;
        }

        device.setName(deviceName);
        buildSubdeviceFromConfig(devConfig);
        device.setImageFromUrl(getDeviceImage(devConfig.image));
        device.setFrameRateTarget(30);
        device.log("Device Name:", deviceName);
    }

    if (serialRaw) {
        deviceSerial = Array.from(serialRaw)
            .map(ch => ch.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase())
            .join("");
        device.log("Device Serial:", deviceSerial);
    }

    return true;
}

function getZoneColors(zone, count, overrideColor) {
    const RGBData = [];
    const positions = generateLedPositions(count);

    for (let i = 0; i < positions.length; i++) {
        const [x, y] = positions[i];
        let color;

        if (overrideColor) {
            color = hexToRgb(overrideColor);
        } else if (LightingMode === "Forced") {
            color = hexToRgb(forcedColor);
        } else {
            color = device.subdeviceColor(`CH${zone}`, x, y);
        }

        RGBData.push(color[0]);
        RGBData.push(color[1]);
        RGBData.push(color[2]);
    }

    return RGBData;
}

function getDeviceImage(image) {
    return `https://dev-dl.skydimo.com/assets/device/${image}.jpg`;
}

function buildSubdeviceFromConfig(config) {
    const zones = config.zones || [];
    const layout = config.layout || 1;

    let offset = 0;
    for (let i = 0; i < layout; i++) {
        const zoneSize = zones[i] || 0;
        const channel = `CH${i + 1}`;
        const name = layout === 1 ? "Device" : `Segment ${i + 1}`;

        device.createSubdevice(channel);
        device.setSubdeviceName(channel, name);
        device.setSubdeviceSize(channel, zoneSize, 1);
        device.setSubdeviceLeds(channel, generateLedNames(zoneSize, offset), generateLedPositions(zoneSize));
        device.setSubdeviceImageUrl(channel, getDeviceImage(config.image));

        offset += zoneSize;
    }
}

function generateLedNames(count, start = 1) {
    const names = [];
    for (let i = start; i < start + count; i++) {
        names.push(`LED ${i}`);
    }
    return names;
}

function generateLedPositions(count) {
    const positions = [];
    for (let i = 0; i < count; i++) {
        positions.push([i, 0]);
    }
    return positions;
}