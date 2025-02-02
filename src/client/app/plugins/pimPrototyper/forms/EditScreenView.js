/**
 * View that provides inputs for creating a new PIM prototyping screen
 * @author Nathaniel Watson
 */
/*global define */
define(function (require, exports, module) {
    var BaseDialog = require("pvsioweb/forms/BaseDialog"),
        d3 = require("d3/d3"),
        template = require("text!./templates/EditScreenView.handlebars");

    var templateHelpers = {
        checked: function (checked) {
            return (checked ? "checked" : "");
        }
    };

    var NewScreenView = BaseDialog.extend({

        events: {
            "click .btn-cancel": "cancel",
            "click .btn-create": "ok"
        },

        /**
         * Creates a new EditScreenView and displays it
         * @param {Object} data Options and data for the view
         * @param {Screen} data.model Screen whose data should be used to popluate the form
         */
        initialize: function (data) {
            this._d3El = d3.select(this.el);
            this._d3El.attr("class", "overlay").style("top", self.scrollY + "px");
            this._template = Handlebars.compile(template);
            this.render();
            this._data = data;
            this.focus();
        },

        render: function () {
            this.$el.html(this._template(this.model.toJSON(), { helpers: templateHelpers }));
            $("body").append(this.el);
            return this;
        },

        ok: function (event) {
            if (this._validate()) {
                BaseDialog.prototype.ok.apply(this, event);
            }
        },

        _validate: function() {
            return this._d3El.select("form").node().checkValidity();
        }
    });

    return NewScreenView;
});
