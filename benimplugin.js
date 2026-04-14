import serial from "@SignalRGB/serial";

export function Name() { return "Skydimo Ultra Minimal Test"; }
export function VendorId() { return 0x1A86; }
export function ProductId() { return [0x7523]; }
export function Publisher() { return "Local Test"; }
export function Type() { return "serial"; }
export function DeviceType() { return "lightingcontroller"; }
export function SubdeviceController() { return true; }

/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/

// BUNU DENEYEREK BUL
const LED_COUNT = 60;

let portName = null;
let connectedOnce = false;
let layoutBuilt = false;

export function ControllableParameters() {
    return [
        { property: "shutdownColor", group: "lighting", label: "Shutdown Color", type: "color", default: "#000000" },
        { property: "LightingMode", group: "lighting", label: "Lighting Mode", type: "combobox", values: ["Canvas", "Forced"], default: "Forced" },
        { property: "forcedColor", group: "lighting", label: "Forced Color", type: "color", default: "#FF0000" },
    ];
}

export function Initialize() {
    const ports = serial.availablePorts();
    if (!ports || !ports.length) {
        console.log("No serial ports found.");
        return;
    }

    const match = ports.find(p => p.vendorId === 0x1A86 && p.productId === 0x7523);
    if (!match) {
        console.log("Skydimo CH340 device not found.");
        return;
    }

    portName = match.portName;
    console.log("Using port:", portName);

    buildStaticLayout();
    connectOnlyOnce();
}

export function Render() {
    if (!connectedOnce) return;
    if (!serial.isConnected()) return;
    if (!layoutBuilt) return;

    sendSolidColor();
}

export function Shutdown(SystemSuspending) {
    if (!serial.isConnected()) return;

    const color = SystemSuspending ? "#000000" : shutdownColor;
    sendSolidColor(color);
    serial.disconnect();
}

function buildStaticLayout() {
    try {
        device.setName(`Skydimo Test ${LED_COUNT}`);
        device.createSubdevice("CH1");
        device.setSubdeviceName("CH1", "Device");
        device.setSubdeviceSize("CH1", LED_COUNT, 1);
        device.setSubdeviceLeds("CH1", generateLedNames(LED_COUNT), generateLedPositions(LED_COUNT));
        device.setFrameRateTarget(10);
        layoutBuilt = true;
        console.log("Static layout created.");
    } catch (e) {
        console.log("Layout creation failed:", e);
    }
}

function connectOnlyOnce() {
    if (!portName) return;
    if (serial.isConnected()) {
        connectedOnce = true;
        return;
    }

    const ok = serial.connect({
        portName: portName,
        baudRate: 115200,
        parity: "None",
        dataBits: 8,
        stopBits: "One"
    });

    if (!ok) {
        console.log("Serial connect failed.");
        return;
    }

    connectedOnce = true;
    device.pause(3000);
    console.log("Connected once to", portName);
}

function sendSolidColor(overrideColor) {
    const colorHex = overrideColor || (LightingMode === "Forced" ? forcedColor : "#FF0000");
    const [r, g, b] = hexToRgb(colorHex);

    const rgbData = [];
    for (let i = 0; i < LED_COUNT; i++) {
        rgbData.push(r, g, b);
    }

    const count = LED_COUNT - 1;
    const hi = (count >> 8) & 0xFF;
    const lo = count & 0xFF;
    const chk = hi ^ lo ^ 0x55;

    // Standart Adalight header
    const packet = [0x41, 0x64, 0x61, hi, lo, chk, ...rgbData];

    const ok = serial.write(packet);
    if (!ok) {
        console.log("Serial write failed.");
    }
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [255, 0, 0];

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
