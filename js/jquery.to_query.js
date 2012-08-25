/*
 * jQuery.to_query / jQuery.apply_query
 * (c) Borgar Thorsteinsson <borgar@borgar.net> - GPLv2 license
 *
 * This is a dirty hackish utility to serialize a form to its minimal
 * "query string" equivalent. This allows saving a state of a form into
 * a URL hash without and reading it back with minimal effort.
 * 
 * The resulting URL's will get a little dirty but this depends on your
 * form. 
 *
 * Some assumtions are made here:
 *
 * 1. each form control includes a valid ID (used as key)
 * 2. each form will be reset to it's default value when string is applied
 * 3. your form does not use multi-selectbox or radio buttons :-)
 *
 */
(function($){

  function getDefaultValue ( ctrl ) {
    var val = ctrl.defaultValue;
    if ( ctrl.type === 'checkbox' ) {
      val = ctrl.defaultChecked ? ctrl.value : '';
    }
    else if ( ctrl.type === 'hidden' ) {
      val = ''; // hidden values don't track defaults
    }
    // TODO: radio
    else if ( ctrl.type === 'select-one' ) {
      var d = -1;
      for (var i=0; i<ctrl.length; i++) {
        if ( ctrl[i].defaultSelected ) {
          d = i;
          val = ctrl[i].value;
        }
      }
      if ( d === -1 ) {
        val = ctrl[0].value;
      }
    }
    // TODO: select-many
    else {
      val = ctrl.defaultValue;
    }
    return val;
  }


  function getValue ( ctrl ) {
    if ( ctrl.type === 'checkbox' ) {
      return ctrl.checked ? ctrl.value : '';
    }
    return ctrl.value;
  }


  $.fn.to_query = function () {
    return this.find(':input')
      .map(function ( s ) {
        if ( !this.id ) { return null; }
        var id = this.id
          , val = getValue( this )
          , def = getDefaultValue( this )
          ;
        if ( val === def || this.disabled ) {
          return null;
        }
        return encodeURIComponent( id ) + '=' + encodeURIComponent( val );
      })
      .get()
      .join('&')
      ;
  };


  $.fn.apply_query = function ( q ) {
    var param = {};
    if ( q ) {
      String( q )
        .match( /([^=&]+)=([^&]*)(?=&|$)/g )
        .forEach(function ( s ) {
          var m = /^([^=]+)=(.*)$/.exec( s );
          if ( m ) {
            param[ decodeURIComponent(m[1]) ] = decodeURIComponent(m[2]);
          }
        })
        ;
    }
    this.find(':input')
      .each(function () {
        if ( !this.id ) { return; }
        if ( this.id in param ) {
          var val = param[ this.id ];
          if ( this.type === 'checkbox' ) {
            this.checked = ( val == this.value );
          }
          else {
            this.value = val;
          }
        }
        else {
          if ( this.type === 'checkbox' ) {
            this.checked = this.defaultChecked;
          }
          else if ( this.type === 'hidden' ) {
            //this.value = getDefaultValue( this );
          }
          else {
            this.value = getDefaultValue( this );
          }
        }
      })
      ;
    return this;
  };

})(jQuery);
