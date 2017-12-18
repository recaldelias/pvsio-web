/**
 * @module NumericDisplayEVO
 * @version 1.0
 * @description Renders a customisable button.
 *              The button has two layers: one layer renders the visual appearance, the other layer captures user interactions with the widget.
 *              This module provide APIs for setting up the visual appearance of the button and the user interactions captured by the button.
 *              Note that the button can also be transparent and without label: this is useful for creating
 *              interactive areas over pictures of a user interface.
 * @author Paolo Masci
 * @date Dec 11, 2017
 *
 * @example <caption>Example use of the widget.</caption>
 // Example pvsio-web demo that uses NumericDisplayEVO
 // The following configuration assumes the pvsio-web demo is stored in a folder within pvsio-web/examples/demo/
 require.config({
     baseUrl: "../../client/app",
     paths: {
         d3: "../lib/d3",
         lib: "../lib",
         text: "../lib/text",
         stateParser: "./util/PVSioStateParser"
     }
 });
 require(["widgets/core/NumericDisplayEVO"], function (NumericDisplayEVO) {
      "use strict";
      var device = {};
      device.btnOk = new NumericDisplayEVO("btnOk", {
        top: 200, left: 120, height: 24, width: 120
      }, {
        softLabel: "Ok",
        fontColor: "black",
        backgroundColor: "blue",
        fontsize: 16,
        callback: function (err, data) { console.log("Ok button clicked"); console.log(data); }
      });
     device.btnOk.render(); // The touchscreen button is rendered.
 });
 *
 */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, esnext:true */
/*global define */
define(function (require, exports, module) {
    "use strict";
    var BasicDisplayEVO = require("widgets/core/BasicDisplayEVO"),
        digits_template = require("text!widgets/templates/digits_template.handlebars");

    const selectedFontSize = 1.076; // ratio selectedFont/normalFont for integer digits

    /**
     * @function <a name="NumericDisplayEVO">NumericDisplayEVO</a>
     * @description Constructor.
     * @param id {String} The ID of the touchscreen button.
     * @param coords {Object} The four coordinates (top, left, width, height) of the display, specifying
     *        the left, top corner, and the width and height of the (rectangular) widget area.
     *        Default is { top: 0, left: 0, width: 32, height: 20 }.
     * @param opt {Object} Options:
     *          <li>blinking (bool): whether the button is blinking (default is false, i.e., does not blink)</li>
     *          <li>align (String): text align: "center", "right", "left", "justify" (default is "center")</li>
     *          <li>backgroundColor (String): background display color (default is black, "transparent")</li>
     *          <li>borderColor (String): border color, must be a valid HTML5 color (default is "steelblue")</li>
     *          <li>borderStyle (String): border style, must be a valid HTML5 border style, e.g., "solid", "dotted", "dashed", etc. (default is "none")</li>
     *          <li>borderWidth (Number): border width (if option borderColor !== null then the default border is 2px, otherwise 0px, i.e., no border)</li>
     *          <li>decimalPointOffset (Number): offset for the decimal point position (default is 0, i.e., the decimal point is placed at the center of the display)</li>
     *          <li>decimalFontSize (Number): decimal font size (default is opt.fontSize * 0.8)</li>
     *          <li>decimalLetterSpacing (Number): fixed letter spacing for decimal digits (default: opt.decimalFontSize * 0.8).</li>
     *          <li>displayKey (String): name of the state attribute defining the button label. Default is the ID of the widget.</li>
     *          <li>fontColor (String): font color, must be a valid HTML5 color (default is "white", i.e., "#fff")</li>
     *          <li>fontFamily (String): font family, must be a valid HTML5 font name (default is "sans-serif")</li>
     *          <li>fontSize (Number): font size (default is (coords.height - opt.borderWidth) / 2 )</li>
     *          <li>decimalFontSize (Number): font size for the decimal part of numbers (default is opt.fontSize * 0.8 )</li>
     *          <li>letterSpacing (Number): fixed letter spacing (default: opt.fontSize * 0.8).</li>
     *          <li>maxIntegerDigits (Number): max digits of the whole part of the display (default is Math.floor(0.75 * coords.width / opt.letterSpacing)).</li>
     *          <li>maxDecimalDigits (Number): max digits of the fractional part of the display (default is Math.floor(0.25 * coords.width / opt.decimalLetterSpacing)).</li>
     *          <li>opacity (Number): opacity of the button. Valid range is [0..1], where 0 is transparent, 1 is opaque (default is opaque)</li>
     *          <li>parent (String): the HTML element where the display will be appended (default is "body")</li>
     *          <li>visibleWhen (string): boolean expression indicating when the display is visible. The expression can use only simple comparison operators (=, !=) and boolean constants (true, false). Default is true (i.e., always visible).</li>
     *          <li>zIndex (String): z-index property of the widget (default is 1)</li>
     * @memberof module:NumericDisplayEVO
     * @instance
     */
     function NumericDisplayEVO(id, coords, opt) {
         // set widget type
         this.type = this.type || "NumericDisplayEVO";
         this.cursorName = opt.cursorName || "";
         // invoke BasicDisplayEVO constructor to create the widget
         BasicDisplayEVO.apply(this, arguments);
         // add widget-specific style attributes
         this.style["letter-spacing"] = opt.letterSpacing || parseFloat(this.style["font-size"]) * 0.8;
         this.style["decimal-font-size"] = opt.decimalFontSize || parseFloat(this.style["font-size"]) * 0.8;
         this.style["decimal-letter-spacing"] = opt.decimalLetterSpacing || parseFloat(this.style["decimal-font-size"]) * 0.8;
         this.maxIntegerDigits = (isNaN(parseInt(opt.maxIntegerDigits))) ? Math.floor(0.75 * this.width / parseFloat(this.style["letter-spacing"])) : parseInt(opt.maxIntegerDigits);
         this.maxDecimalDigits = (isNaN(parseInt(opt.maxDecimalDigits))) ? Math.floor(0.25 * this.width / parseFloat(this.style["decimal-letter-spacing"])) : parseInt(opt.maxDecimalDigits);
         this.decimalPointOffset = opt.decimalPointOffset || 0;
         return this;
     }
     NumericDisplayEVO.prototype = Object.create(BasicDisplayEVO.prototype);
     NumericDisplayEVO.prototype.parentClass = BasicDisplayEVO.prototype;
     NumericDisplayEVO.prototype.constructor = NumericDisplayEVO;

     /**
      * @function <a name="render">render</a>
      * @description Rendering function for button widgets.
      * @memberof module:NumericDisplayEVO
      * @instance
      */
     NumericDisplayEVO.prototype.render = function (res) {
         if (res && typeof res === "string") {
             var val = res;
             res = {};
             res[this.displayKey] = val;
         }
         if (res && typeof res === "object" && this.evalViz(res)) {
             var disp = this.evaluate(this.displayKey, res);
             var parts = disp.split(".");
             var _this = this;

             var desc = {
                 whole: [], frac: [],
                 point: (disp.indexOf(".") >= 0),
                 whole_zeropadding: [], frac_zeropadding: [],
                 max_integer_digits: this.maxIntegerDigits,
                 max_decimal_digits: this.maxDecimalDigits
             };
             desc.whole = parts[0].split("").map(function (d) {
                 return { val: d, selected: false, "font-size": parseFloat(_this.style["font-size"]) };
             });
             if (parts.length > 1) {
                 desc.frac = parts[1].split("").map(function (d) {
                     return { val: d, selected: false, "font-size": parseFloat(_this.style["decimal-font-size"]) };
                 });
             }
             desc.cursorPos = parseInt(this.evaluate(this.cursorName, res));
             if (!isNaN(desc.cursorPos)) {
                 if (desc.cursorPos >= 0) {
                     if (desc.cursorPos < desc.whole.length) {
                         desc.whole[desc.whole.length - 1 - desc.cursorPos].selected = true;
                         desc.whole[desc.whole.length - 1 - desc.cursorPos].fontSize *= selectedFontSize;
                     } else { // introduce leding zeros
                         desc.whole_zeropadding = new Array(desc.cursorPos - (desc.whole.length - 1)).fill({
                             val: 0, selected: false, "font-size": parseFloat(_this.style["font-size"])
                         });
                         desc.whole_zeropadding[0] = {
                             val: 0, selected: true, "font-size": parseFloat(_this.style["font-size"]) * selectedFontSize
                         };
                     }
                 } else if (desc.cursorPos < 0) {
                     if (-(desc.cursorPos + 1) < desc.frac.length) {
                         desc.frac[-(desc.cursorPos + 1)].selected = true;
                     } else { // introduce trailing zeros and introduce the decimal point
                         desc.frac_zeropadding = new Array(-desc.cursorPos - desc.frac.length).fill({
                             val: 0, selected: false, "font-size": parseFloat(_this.style["decimal-font-size"])
                         });
                         desc.frac_zeropadding[desc.frac_zeropadding.length - 1] = {
                             val: 0, selected: true, "font-size": parseFloat(_this.style["decimal-font-size"])
                         };
                         desc.point = true;
                     }
                 }
             }
            //  console.log(desc);
             var point_style = {
                 "left": (parseFloat(desc.max_integer_digits) * parseFloat(this.style["letter-spacing"]) + parseFloat(this.decimalPointOffset)).toFixed(2),
                 "width": (parseFloat(this.style["letter-spacing"]) / 2).toFixed(2),
                 "margin-left": (-parseFloat(this.style["letter-spacing"]) / 32).toFixed(2),
                 "font-size": parseFloat(this.style["decimal-font-size"]).toFixed(2),
                 "viz": desc.point
             };
             var whole_style = {
                 "digits": desc.whole_zeropadding.concat(desc.whole),
                 "width": parseFloat(desc.max_integer_digits) * parseFloat(this.style["letter-spacing"]),
                 "left": parseFloat(point_style.left) - parseFloat(point_style.width),
                 "letter-spacing": parseFloat(this.style["letter-spacing"]).toFixed(2),
                 "color": this.style.color,
                 "background-color": this.style["background-color"],
                 "padding-left": ((parseFloat(desc.max_integer_digits) - parseFloat(desc.whole.length) - parseFloat(desc.whole_zeropadding.length)) * parseFloat(this.style["letter-spacing"])).toFixed(2)
             };
             var frac_style = {
                 "digits": desc.frac.concat(desc.frac_zeropadding),
                 "width": (parseFloat(desc.max_decimal_digits) * parseFloat(this.style["decimal-letter-spacing"])).toFixed(2),
                 "left": (parseFloat(point_style.left) + parseFloat(point_style.width)).toFixed(2),
                 "letter-spacing": parseFloat(this.style["decimal-letter-spacing"]).toFixed(2),
                 "color": this.style.color,
                 "background-color": this.style["background-color"]
             };
             console.log(frac_style);
             frac_style.viz = (frac_style.digits.length > 0);
             var dom = Handlebars.compile(digits_template, { noEscape: true })({
                 type: this.type,
                 whole: whole_style,
                 frac: frac_style,
                 point: point_style
             });
             this.base.html(dom);
         }
         this.reveal();
         return this;
     };

     module.exports = NumericDisplayEVO;
});
