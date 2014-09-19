/**
 * Displays a notification to the user. This module is a variant of displayQuestion.js
 * @author Paolo Masci
 * @date 5/5/14 16:29:00 PM
 */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, d3, require, $, brackets, window, Backbone, Handlebars, self */
define(function (require, exports, module) {
    "use strict";
    var d3 = require("d3/d3"),
        formTemplate = require("text!./templates/displayNotification.handlebars"),
        FormUtils = require("./FormUtils");
    
    var NotificationView = Backbone.View.extend({
        initialize: function (data) {
            d3.select(this.el).attr("class", "overlay").style("top", self.scrollY + "px");
            this.render(data);
        },
        render: function (data) {
            var template = Handlebars.compile(formTemplate);
            this.$el.html(template(data));
            $("body").append(this.el);
            return this;
        },
        events: {
			"click #btnOk": "ok"
		},
		ok: function (event) {
			var form = this.el;
			if (FormUtils.validateForm(form)) {
				var formdata = FormUtils.serializeForm(form);
				this.trigger("ok", {data: formdata, el: this.el}, this);
			}
		}
    });
    
    module.exports = {
        /**
         * creates a new form view to display questions. Renders two buttons for
         * taking positive or negative responses to the question posed.
         * @param {header: {string}, notification: {string}} data Data to use to render the form
         */
        create: function (data) {
            return new NotificationView(data);
        }
    };
});