(function(glob){
  "use strict";

  /*
   * === LDML number formatter ===
   *
   * This implements the Unicode number formatting standard.
   * See: http://unicode.org/reports/tr35/#Number_Format_Patterns
   *
   * (c) Borgar Thorsteinsson <borgar@borgar.net>
   *
   */

  var re_subpatt = /^((?:'[^']*'|[^';]+)*)(?:;(.*))?$/
    , re_chunker = /^((?:'[^']*'|[^0-9@#.,])*)([0-9@#.,E+]+)(.*)$/
    , re_numbits = /^([^E\.]*)(?:\.([^E]*))?(?:E(\+?)(.*))?$/
    , round = Math.round
    , abs   = Math.abs
    , pow   = Math.pow
    , log   = Math.log
    , LN10  = Math.LN10
    , ceil  = Math.ceil
    , floor = Math.floor
    , EPSILON = 1e-12
    , def_l10n = {
        thousands_separator : ','
      , decimal_separator   : '.'
      , positive_sign       : '+'
      , negative_sign       : '-'
      , exponent_symbol     : 'E'
      , infinity_symbol     : '∞'
      , nan_symbol          : '☹'
      }
    ;


  function unquote ( s ) {
    return s && s.replace( /'([^']+)'/g, '$1' ).replace( /''/g, "'" );
  }


  function roundhalfeven ( value, places ) {
    if ( value < 0 ) {
      return -roundhalfeven( -value, places );
    }
    if ( places ) {
      var p = pow( 10, places || 0 ) || 1;
      return roundhalfeven( value * p, 0 ) / p;
    }
    var ipart = floor( value );
    var dist = ( value - ( ipart + 0.5 ) );
    if ( dist > -EPSILON && dist < EPSILON ) {
      return ( ipart % 2 < EPSILON ) ? ipart : ceil( ipart + 0.5 );
    }
    return round( value );
  }


  function split_sign ( n, min, max, pad ) {
    var inf = ( max === Infinity )
      , d   = ( inf ) ? 0 : ceil( n ? log( n < 0 ? -n: n ) / LN10 : 1 )
      , adj = ( inf ) ? abs( n ) : roundhalfeven( abs(n), floor( max - floor( d ) ) )
      , v   = floor( adj )
      , i   = String( v )
      , f   = String( adj ).split( '.' )[ 1 ] || ''
      , w   = adj ? ( v && i.length ) + f.length + ( d < 0 ? d : 0 ) : 1
      ;
    if ( min > w ) {
      f += Array( min - w + 1 ).join( pad );
    }
    return [ i, f ]
  }


  function f_int ( n, min, max, pad ) {
    if ( !n && !min ) { return ''; }
    var i = String( n );
    if ( i.length > max ) {
      // For example, 1997 is formatted as "97" if the maximum integer digits is set to 2.
      return i.substr( i.length - max );
    }
    while ( i.length < min ) {
      // For example, 1997 is formatted as "01997" if the minimum integer digits is set to 5.
      i = pad + i;
    } 
    return i;
  }


  function numfmt ( pattern, locale ) {

    // resolve default pattern for locale if no pattern was provided
    if ( !pattern ) { // some default
      pattern = '#,##0.###;-#,##0.###;0;@';
    }

    // localizable things
    locale = locale || 'en';
    var l10n = numfmt.locale[ locale ] || {};
    var thousands_separator = l10n.thousands_separator || def_l10n.thousands_separator
      , decimal_separator   = l10n.decimal_separator   || def_l10n.decimal_separator
      , positive_sign       = l10n.positive_sign       || def_l10n.positive_sign
      , negative_sign       = l10n.negative_sign       || def_l10n.negative_sign
      , exponent_symbol     = l10n.exponent_symbol     || def_l10n.exponent_symbol
      , infinity_symbol     = l10n.infinity_symbol     || def_l10n.infinity_symbol
      , nan_symbol          = l10n.nan_symbol          || def_l10n.nan_symbol
      ;

    var p = function ( n ) {

      var is_neg = ( n < 0 ) * 1
        , f = ''
        , i = ''
        , v
        , e
        , si = 0
        ;

      n *= p.scale;

      // == normal formatting ==
      if ( !isFinite( n ) ) {

        i = isNaN( n ) // TODO: these should be localizable
          ? nan_symbol
          : infinity_symbol
          ;  

      }
      else if ( p.exponent ) {

        v = abs( n );
        e = ( v )
              ? floor( log( v ) / LN10 )
              : 0
              ;

        if ( p.int_min === p.int_max ) { // Minimum number of integer digits
          e -= ( p.int_min - 1 );
        }
        else if ( p.int_max && isFinite( p.int_max ) ) { // Exponent grouping
          e = floor( e / p.int_max ) * p.int_max;
        }

        v = ( e < 0 ) ? v * pow( 10, -e ) : v / pow( 10, e );

        var s = split_sign( v, p.frac_min + p.int_min, p.frac_max + p.int_max, p.pad );

        var r = p.prefix[0]
             + ( is_neg ? negative_sign : '' )
             + ( s[0] + ( s[1] ? decimal_separator + s[1] : '' ) )
             + exponent_symbol
             + ( ( e < 0 ) ? negative_sign : ( p.exp_plus ) ? positive_sign : '' )
             + f_int( abs( e ), p.exp_min, Infinity, p.pad )
             + p.suffix[0]
             ;

        return r;

      }
      else if ( p.significance ) {

        var s = split_sign( n, p.sig_min, p.sig_max, p.pad );
        i = s[0];
        f = s[1];

      }
      else {

        if ( p.frac_min === p.frac_max && !p.frac_min ) {
          v = round( abs( n ) );
        }
        else {
          v = floor( abs( n ) );
        }

        if ( p.int_max !== Infinity ) {
          // is is possible to add a max digits to non-sci patterns?
          // we should parse this as infinite and allow user to set int_max
        }
        i = f_int( v, p.int_min, Infinity, p.pad );

        if ( n % 1 ) {
          // have fraction
          f = String( roundhalfeven( n, p.frac_max ) ).split( '.' )[ 1 ] || '';
          while ( f.length < p.frac_min ) { f += p.pad; } // FIXME: faster padding
        }
        else {
          // no fraction -- just add some zeros
          while ( f.length < p.frac_min ) { f += '0'; }
        }

      }

      if ( isFinite( n ) && p.grouping ) {
        var ret = ''
          , ipos = i.length
          , gsize = p.group_sec
          ;
        if ( ipos > p.group_pri ) {
          ret = thousands_separator + i.substr( ipos -= p.group_pri, p.group_pri ) + ret;
        }
        while ( ipos > gsize ) {
          ret = thousands_separator + i.substr( ipos -= gsize, gsize ) + ret;
        }
        i = ipos ? i.substr( 0, ipos ) + ret : ret;
      }

      f = p.prefix[ is_neg ]
          + i
          + ( f ? decimal_separator + f : '' )
          + p.suffix[ is_neg ]
          ;

      return f;
    };

    var s        = re_subpatt.exec( pattern )
      , pos_bits = re_chunker.exec( s[1] )
      , number   = pos_bits[2] || ''
      , neg_bits = s[2] ? re_chunker.exec( s[2] ) : null
      , num_bits = re_numbits.exec( number )
      , integer  = num_bits[1] || ''
      , fraction = num_bits[2] || ''
      ;

    p.pattern      = pattern;

    p.significance = number.indexOf( '@' ) >= 0;
    p.exponent     = number.indexOf( 'E' ) >= 0;

    p.grouping     = number.indexOf( ',' ) >= 0;

    p.exp_plus  = !!num_bits[3];  // show exponent positive mark


    if ( /\d(?=.*#)/.test( integer ) ) {
      throw new Error( 'Nonsensical number pattern: ' + integer );
    }
    if ( /#(?=.*\d)/.test( fraction ) ) {
      throw new Error( 'Nonsensical number pattern: ' + fraction );
    }
    if ( p.exponent && p.grouping ) {
      // "Exponential patterns may not contain grouping separators"
      throw new Error( 'Exponential patterns must not contain ","' );
    }
    if ( p.significance && number.indexOf( '.' ) >= 0 ) {
      // "If a pattern uses significant digits, it may not contain a decimal separator [...]"
      throw new Error( 'Significant digit patterns must not contain ".": ' + pattern );
    }
    if ( p.significance && integer.indexOf( '0' ) >= 0 ) {
      // "If a pattern uses significant digits, it may not contain [...] the '0' pattern character."
      throw new Error( 'Significant digit patterns must not contain "0": ' + pattern );
    }

    // parse min/max digit counts
    p.int_max  = ( !p.exponent && !p.significance /*&& (integer.length < 1 || integer.charAt(0) === '#')*/ )
                  ? Infinity
                  : integer.replace( /[,]/g ,'' ).length
                  ;
    p.int_min  = ( integer.length < 1 )
                  ? 0
                  : integer.replace( /[,#]/g, '' ).length || 1
                  ;  
    p.frac_max = fraction.replace( /[,]/g, '' ).length;
    p.frac_min = fraction.replace( /[,#]/g, '' ).length;

    p.prefix   = [ unquote( pos_bits[1] )
                 , unquote( neg_bits ? neg_bits[1] : '-' + pos_bits[1] )
                 ];
    p.suffix   = [ unquote( pos_bits[3] )
                 , unquote( neg_bits ? neg_bits[3] :       pos_bits[3] )
                 ];

    p.pad      = '0';
    var clean  = pattern.replace( /'([^']*)'/g, '' );
    p.scale    = /%/.test( clean ) ? 100 : 1;

    if ( p.significance ) {
      var sig_bits = /(@+)([^\.E]*)/.exec( number );
      p.sig_min = sig_bits[1].length;
      p.sig_max = p.sig_min + sig_bits[2].length;
    }
    else {
      p.sig_min = 1;
      p.sig_max = Infinity;
    }

    if ( p.grouping ) {
      var s = ( integer || '' ).split( ',' )
        , sl = s.length
        ;
      if ( sl === 2 ) {
        p.group_pri = p.group_sec = s[1].length;
      }
      else if ( sl > 2 ) {
        p.group_pri = s[ sl - 1 ].length;
        p.group_sec = s[ sl - 2 ].length;
      }
    }
    else {
      p.group_pri = 0;
      p.group_sec = 0;
    }

    if ( p.exponent ) {
      // The number of digit characters after the exponent character gives the
      // minimum exponent digit count. There is no maximum.
      p.exp_min = num_bits[4].length;
      if ( p.significance ) {
        p.int_min  = p.int_max = 1;
        p.frac_min = p.sig_min;
        p.frac_max = p.sig_max;
      }
    }

    return p;
  }

  // expose
  numfmt.round = roundhalfeven;
  numfmt.locale = { 'en': def_l10n };
  glob.numfmt = numfmt;

})(this);
