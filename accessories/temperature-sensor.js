const { assert } = require('chai');
const uuid = require('uuid');
const fs = require('fs');
const findKey = require('find-key');

const delayForDuration = require('../helpers/delayForDuration');
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
    const { config, state } = this;

    config.temperatureUpdateFrequency = config.temperatureUpdateFrequency || 10;
  }

  // Device Temperature Methods

  async monitorTemperature() {
    const { config, host, log, name, state } = this;

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
