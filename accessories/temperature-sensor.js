const uuid = require('uuid');

const delayForDuration = require('../helpers/delayForDuration');
const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const { getDevice } = require('../helpers/getDevice');
const BroadlinkRMAccessory = require('./accessory');

class TemperatureSensorAccessory extends BroadlinkRMAccessory {

  serviceType() { return Service.TemperatureSensor }

  constructor(log, config = {}) {
    super(log, config);
    this.temperatureCallbackQueue = {};
    this.monitorTemperature();
  }

  setDefaults() {
    const { config } = this;

    config.temperatureUpdateFrequency = config.temperatureUpdateFrequency || 10;
  }

  // Device Temperature Methods

  async monitorTemperature() {
    const { config, host, log, name } = this;

    // Ensure a minimum of a 60 seconds update frequency 
    const temperatureUpdateFrequency = Math.max(60, config.temperatureUpdateFrequency);

    const device = getDevice({ host, log });

    // Try again in a second if we don't have a device yet
    if (!device) {
      await delayForDuration(1);

      this.monitorTemperature();

      return;
    }

    log(`${name} monitorTemperature`);

    device.on('temperature', this.onTemperature.bind(this));
    device.checkTemperature();

    this.updateTemperatureUI();
    if (!config.isUnitTest) setInterval(this.updateTemperatureUI.bind(this), temperatureUpdateFrequency * 1000)
  }

  onTemperature(temperature) {
    this.state.currentTemperature = temperature;
    this.processQueuedTemperatureCallbacks(temperature);
  }

  addTemperatureCallbackToQueue(callback) {
    const { host, log, name, state } = this;

    // Clear the previous callback
    if (Object.keys(this.temperatureCallbackQueue).length > 1) {
      if (state.currentTemperature) {
        log(`${name} addTemperatureCallbackToQueue (clearing previous callback, using existing temperature)`);

        this.processQueuedTemperatureCallbacks(state.currentTemperature);
      }
    }

    // Add a new callback
    const callbackIdentifier = uuid.v4();
    this.temperatureCallbackQueue[callbackIdentifier] = callback;

    // Read temperature from Broadlink RM device
    // If the device is no longer available, use previous tempeature 
    const device = getDevice({ host, log });

    if (!device || device.state === 'inactive') {
      if (device && device.state === 'inactive') {
        log(`${name} addTemperatureCallbackToQueue (device no longer active, using existing temperature)`);
      }

      this.processQueuedTemperatureCallbacks(state.currentTemperature || 0);

      return;
    }

    device.checkTemperature();
    log(`${name} addTemperatureCallbackToQueue (requested temperature from device, waiting)`);
  }

  processQueuedTemperatureCallbacks(temperature) {
    if (Object.keys(this.temperatureCallbackQueue).length === 0) return;

    Object.keys(this.temperatureCallbackQueue).forEach((callbackIdentifier) => {
      const callback = this.temperatureCallbackQueue[callbackIdentifier];

      callback(null, temperature);
      delete this.temperatureCallbackQueue[callbackIdentifier];
    })

    this.temperatureCallbackQueue = {};
  }

  updateTemperatureUI() {
    const { serviceManager } = this;

    serviceManager.refreshCharacteristicUI(Characteristic.CurrentTemperature)
  }

  getCurrentTemperature(callback) {
    this.addTemperatureCallbackToQueue(callback);
  }

  // Service Manager Setup

  setupServiceManager() {
    const { name, serviceManagerType } = this;

    this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.TemperatureSensor, this.log);

    this.serviceManager.addGetCharacteristic({
      name: 'currentTemperature',
      type: Characteristic.CurrentTemperature,
      method: this.getCurrentTemperature,
      bind: this
    })
  }
}

module.exports = TemperatureSensorAccessory
