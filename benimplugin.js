import serial from "@SignalRGB/serial";

export function Name() { return "Skydimo LED Strip Static Test"; }
export function VendorId() { return 0x1A86; }
export function ProductId() { return [0x7523]; }
export function Publisher() { return "Local Patch"; }
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
        { property: "shutdownColor", group: "lighting", label: "Shutdown Color", type: "color", default: "#000000" },
        { property: "LightingMode", group: "lighting", label: "Lighting Mode", type: "combobox", values: ["Canvas", "Forced"], default: "Canvas" },
        { property: "forcedColor", group: "lighting", label: "Forced Color", type: "color", default: "#009bde" },
    ];
}

// KENDİ CİHAZINA GÖRE BUNU DEĞİŞTİR
const LED_COUNT = 114;

let skydimoPortName = null;
let initialized = false;
let lastReconnectAttempt = 0;
const RECONNECT_INTERVAL = 5000;

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

    setupDeviceLayout();
    connectToSkydimo();
}

export function Render() {
    if (!skydimoPortName) return;

    if (!serial.isConnected()) {
        const now = Date.now();
        if (now - lastReconnectAttempt > RECONNECT_INTERVAL) {
            lastReconnectAttempt = now;
            console.log("Serial disconnected, retrying...");
            connectToSkydimo();
        }
        return;
    }

    if (!initialized) {
        setupDeviceLayout();
    }

    sendColors();
}

export function Shutdown(SystemSuspending) {
    if (!skydimoPortName) return;
    const color = SystemSuspending ? "#000000" : shutdownColor;
    sendColors(color);
    disconnect();
}

function setupDeviceLayout() {
    try {
        device.setName(`Skydimo Static ${LED_COUNT}`);
        device.createSubdevice("CH1");
        device.setSubdeviceName("CH1", "Device");
        device.setSubdeviceSize("CH1", LED_COUNT, 1);
        device.setSubdeviceLeds("CH1", generateLedNames(LED_COUNT), generateLedPositions(LED_COUNT));
        device.setFrameRateTarget(20);
        initialized = true;
        console.log("Static layout initialized.");
    } catch (e) {
        console.log("Layout init error:", e);
    }
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

    device.pause(1500);
    console.log("Connected to Skydimo on", skydimoPortName);
    return true;
}

function disconnect() {
    if (serial.isConnected()) {
        serial.disconnect();
        console.log("Disconnected from serial port");
    }
}

function sendColors(overrideColor) {
    if (!serial.isConnected()) return;

    const rgbData = [];
    const positions = generateLedPositions(LED_COUNT);

    for (let i = 0; i < positions.length; i++) {
        const [x, y] = positions[i];
        let color;

        if (overrideColor) {
            color = hexToRgb(overrideColor);
        } else if (LightingMode === "Forced") {
            color = hexToRgb(forcedColor);
        } else {
            color = device.subdeviceColor("CH1", x, y);
        }

        rgbData.push(color[0], color[1], color[2]);
    }

    const count = LED_COUNT - 1;
    const hi = (count >> 8) & 0xFF;
    const lo = count & 0xFF;
    const chk = hi ^ lo ^ 0x55;

    // Doğru Adalight header
    const packet = [0x41, 0x64, 0x61, hi, lo, chk, ...rgbData];

    const success = serial.write(packet);
    if (!success) {
        console.log("Failed to write LED colors");
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

function generateLedNames(count) {
    const names = [];
    for (let i = 1; i <= count; i++) {
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