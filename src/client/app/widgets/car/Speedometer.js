/**
 * @module Speedometer
 * @version 1.0
 * @description Renders a basic speedometer.
 * @author Henrique Pacheco
 * @date Mar 1, 2017
 */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, d3_gauge_plus*/

define(function (require, exports, module) {
    "use strict";

    /**
     * @function <a name="Speedometer">Speedometer</a>
     * @description Constructor.
     * @param id {String} The ID of the display.
     * @param coords {Object} The four coordinates (top, left, width, height) of the display, specifying
     *        the left, top corner, and the width and height of the (rectangular) display.
     *        Default is { top: 0, left: 0, width: 200, height: 80 }.
     * @param opt {Object} Options:
     *          <li>backgroundColor (String): background display color (default is black, "#000")</li>
     *          <li>fontfamily (String): display font type (default is "sans-serif")</li>
     *          <li>fontColor (String): display font color (default is white, "#fff")</li>
     *          <li>align (String): text alignment (default is "center")</li>
     *          <li>inverted (Bool): if true, the text has inverted colors,
     *              i.e., fontColor becomes backgroundColor, and backgroundColor becomes fontColor (default is false)</li>
     *          <li>parent (String): the HTML element where the display will be appended (default is "body")</li>
     * @memberof module:Speedometer
     * @instance
     */
    function Speedometer(id, opt) {
        function createGauge(id, opt) {
            var config = {
                size: 400,
                rotation: 270,
                gap: 90,
                drawOuterCircle: false,
                innerStrokeColor: "#fff",
                label: "",
                labelSize: 0.1,
                labelColor: "#888",
                min: opt.min,
                max: opt.max,
                initial: opt.initial,
                majorTicks: 11,
                transitionDuration: 300,
                greenZones: [ ],
                yellowZones: [ ],
                redZones: [ { from: (opt.max - (opt.max * 0.1)), to: opt.max } ]
            };
            return new d3_gauge_plus.Gauge(id, config);
        }
        opt = opt || {};
        // Speedometer params
        opt.max = opt.max || 200;
        opt.min = opt.min || 0;
        opt.initial = opt.initial || 0;
        if (opt.label === "kmh") {
            opt.label = "Km/h";
        }
        // D3 Gauge Plus object
        this.gauge_obj = createGauge(id, opt);
        // display the gauge
        this.gauge_obj.render();

        return this;
    }

    Speedometer.prototype.render = function(speed, opt) {
        opt = opt || {};
        if (speed) {
            this.gauge_obj.setPointer(speed);
        }
    };

    Speedometer.prototype.zone = function(from, to) {
        return { from: from, to: to };
    };

    module.exports = Speedometer;
});