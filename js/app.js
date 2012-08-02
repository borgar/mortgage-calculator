// add icelandic to number formatter
numfmt.locale['is'] = {
  thousands_separator : '.'
, decimal_separator   : ','
};

// run app
jQuery(function ($) {

  // returns the payment amount for a loan based on an interest rate and a constant payment schedule
  function PMT ( irate, npayments, PV ) {
    return PV * irate * Math.pow((1 + irate), npayments) / ( Math.pow((1 + irate), npayments) - 1 );
  }

  var colors = [ '#000099', '#ed561b' ];
  var current_data;
  var current_driver;

  // these are called by the amortizer to calculate each payment
  // the init/calculate functions are called with this === loan, first parameter === payment row
  var loan_drivers = {
    'idx_eq': {
      indexed: true,
      calculate: function ( row ) {
        row.capital_payment    = row.period_captial_start / ( this.period - row.index );
        row.amount_payed       = row.capital_payment + row.interest;
        row.period_captial_end = row.period_captial_start - row.capital_payment;
        row.period_captial_end += (row.period_captial_end * this.inflation);
        return row;
      }
    },
    'idx_pmt': {
      indexed: true,
      calculate  : function ( row ) {
        row.amount_payed       = PMT( this.interest, (this.period - row.index), row.period_captial_start );
        row.capital_payment    = row.amount_payed - row.interest;
        row.period_captial_end = row.period_captial_start - row.capital_payment;
        row.period_captial_end += (row.period_captial_end * this.inflation);
        return row;
      }
    },
    'eq': {
      indexed: false,
      calculate: function ( row ) {
        row.capital_payment    = this.principal / this.period;
        row.amount_payed       = row.capital_payment + row.interest;
        row.period_captial_end = row.period_captial_start - row.capital_payment;
        return row;
      }
    },
    'pmt': {
      indexed: false,
      calculate: function ( row ) {
        row.amount_payed       = PMT( this.interest, this.period, this.principal );
        row.capital_payment    = row.amount_payed - row.interest;
        row.period_captial_end = row.period_captial_start - row.capital_payment;
        return row;
      }
    }
  };

  // these are called by the plotter to convert payments to {x:# y:#} format
  // the init/calculate functions are called with this === loan
  var display_drivers = {
    loan_std_capital: {
      title: "Þróun höfuðstóls yfir lánstímabil",
      plot: 'line',
      calculate: function ( d ) {
        return { x: d.index + 1, y: d.period_captial_end };
      }
    },
    loan_std_payments: {
      title: "Afborganir á ári yfir lánstímabil",
      plot: 'bar',
      calculate: function ( d ) {
        return { x: d.index + 1, y: d.payment_upcalc };
      }
    },
    loan_vs_property1: {
      title: "Höfuðstóll sem hlutfall af markaðvirði eignar",
      plot: 'line',
      extra_controls: 'loan_vs_property',
      percent: true,
      init: function () {
        this.property_value  = Number( $( '#property_value' ).val() );
        this.property_growth = Number( $( '#property_growth' ).val() ) / 100;
      },
      calculate: function ( d ) {
        var upvalue = this.property_value * ( 1 + this.property_growth * d.index );
        var y = (d.period_captial_end / upvalue) * 100;
        return { x: d.index + 1, y: y };
      }
    },
    loan_vs_property2: {
      title: "Verðmæti eignar umfram áhvílandi höfuðstól",
      plot: 'line',
      extra_controls: 'loan_vs_property',
      init: function () {
        this.property_growth = ( $( '#property_growth' ).val() * 1 / 100 );
        this.property_value = $( '#property_value' ).val() * 1;
      },
      calculate: function ( d ) {
        var upvalue = this.property_value * ( 1 + this.property_growth * d.index );
        var y = (upvalue - d.period_captial_end);
        return { x: d.index + 1, y: y };
      }
    },
    loan_vs_income1: {
      title: "Afborganir sem hlutfall af ráðstöfunartekjum",
      plot: 'bar',
      percent: true,
      extra_controls: 'loan_vs_income',
      init: function () {
        this.income_post_taxes = Number( $( '#income_post_taxes' ).val() ) * 12;
        this.income_growth     = Number( $( '#income_growth' ).val() ) / 100;
      },
      calculate: function ( d ) {
        var upvalue = this.income_post_taxes * ( 1 + this.income_growth * d.index );
        var y = ( d.payment_upcalc / upvalue ) * 100;
        return { x: d.index + 1, y: y };
      }
    },
    loan_vs_income2: {
      title: "Ráðstöfunartekjur umfram afborgun",
      plot: 'bar',
      extra_controls: 'loan_vs_income',
      init: function () {
        this.income_post_taxes = Number( $( '#income_post_taxes' ).val() ) * 12;
        this.income_growth     = Number( $( '#income_growth' ).val() ) / 100;
      },
      calculate: function ( d ) {
        var upvalue = this.income_post_taxes * ( 1 + this.income_growth * d.index );
        var y = upvalue - d.payment_upcalc;  // TODO: allow negatives?
        return { x: d.index + 1, y: y };
      }
    }
  };


  // read the properties of a loan for the UI and return a customized "driver"
  function get_loan_properties ( loan_elm_id ) {
    var type = $( loan_elm_id + '_type' ).val();
    var driver = $.extend( {}, loan_drivers[ type ] );
    driver.principal = Number( $( loan_elm_id + '_principal' ).val() || 0 );
    driver.interest  = Number( $( loan_elm_id + '_interest' ).val() || 0 ) / 100;
    driver.period    = Number( $( loan_elm_id + '_period' ).val() || 1 );
    driver.inflation = Number( $( '#inflation' ).val() || 0 ) / 100;
    driver.active    = $( loan_elm_id + "_on" )[ 0 ].checked;
    return driver;
  }


  // amortization
  function amortize ( loan ) {
    if ( typeof loan.init === 'function' ) {
      loan.init();
    }
    var current_capital = loan.principal;
    loan.payments = pv.range( loan.period ).map(function ( i ) {
      var row = loan.calculate({
        'index': i,
        'period_captial_start': current_capital,
        'interest': current_capital * loan.interest,
        'capital_payment': null,
        'amount_payed': null,
        'currency_worth': Math.pow( 1 / (1 + loan.inflation), i ),
        'payment_upcalc': null,
        'period_captial_end': null
      });
      // allow calculation methods to skip setting period_captial_end
      if ( null === row.period_captial_end && 
           null !== row.period_captial_start && 
           null !== row.capital_payment ) {
        row.period_captial_end = ( row.period_captial_start - row.capital_payment );
      }
      // núvirðing
      if ( null === row.payment_upcalc ) {
        row.payment_upcalc = row.amount_payed * row.currency_worth;
      }
      //
      current_capital = row.period_captial_end;
      return row;
    });
    return loan;
  }



  function plot ( loans, display_driver ) {

    var y_min = Infinity;
    var y_max = -Infinity;
    var x_min = Infinity;
    var x_max = -Infinity;
    var data = loans
      .map(function ( loan ) {
        if ( typeof display_driver.init === 'function' ) {
          display_driver.init.call( loan );
        }
        if ( !loan.active ) { return []; }
        var series = loan.payments
              .map( display_driver.calculate, loan )
              .filter(function ( d ) {
                return isFinite(d.x) && isFinite(d.y);
              })
              ;
        series.forEach(function ( d ) {
          // FIXME: this is super slow...
          y_min = Math.min( d.y, y_min );
          y_max = Math.max( d.y, y_max );
          x_min = Math.min( d.x, x_min );
          x_max = Math.max( d.x, x_max );
        });
        return series;
      })
      ;

    var fmt_ptn = display_driver.percent ? "#0'%'" : "#,##0.##";
    var fmt = numfmt( fmt_ptn, 'is' );

    // make sure ranges are finite
    if ( !isFinite( y_max ) ) { y_max = 1000000; }
    if ( !isFinite( y_min ) ) { y_min = 0; }
    if ( !isFinite( x_max ) ) { x_max = 10; }
    if ( !isFinite( x_min ) ) { x_min = 0; }

    var fit_space = $( '#col2' ).innerWidth();

    var margin_top = 35
      , margin_right = 10
      , margin_bottom = 20
      , margin_left = 65
      , w = fit_space - (margin_left + margin_right) // 480
      , aspect = 1 / 1.618
      , h = w * aspect
      , x_scale = pv.Scale.linear( x_min, x_max )
      , y_scale = pv.Scale.linear( y_min < 0 ? y_min : 0, y_max ).nice( 0 )
      , y_axis_color = "#555"
      , x_axis_color = "#555"
      ;

    // Y-axis
    var y_axis_top = 0;
    var y_axis_bottom = 0;
    var y = y_scale.range( 0, h );
    var n_y_ticks = ~~( h / 25 );
    var y_ticks = y.ticks( Math.max( 2, n_y_ticks ) );

    // frame
    var vis = new pv.Panel()
        .canvas( document.getElementById('plot_area') )
        //.fillStyle('#ddd')
        .width( w )
        .height( w * aspect )
        .bottom( margin_bottom )
        .left( margin_left )
        .right( margin_right )
        .top( margin_top )
        ;

    vis.add(pv.Label)
        .text( display_driver.title )
        .top( 0 )
        .textMargin( 10 )
        .textAlign( 'center' )
        .font( '16px sans-serif')
        ;

    // now add y axis 
    vis.add(pv.Rule)
        .left(0).top( y_axis_top ).bottom( y_axis_bottom )
        .strokeStyle( y_axis_color )
        ;

    vis.add(pv.Rule)
        .data( y_ticks )
        .bottom(y)
        .strokeStyle( y_axis_color )
        .lineDash([1,3])
      .anchor("left")
        .add(pv.Label)
          .textStyle( y_axis_color )
          .text( fmt ) // y.tickFormat
          ;

    // X-axis
    var x = x_scale.range( 0, w );

    vis.add( pv.Rule )
        .bottom( 0 )
        .right( 0 )
        .left( x( x_min ) )
        .strokeStyle( x_axis_color )
        ;

    vis.add(pv.Rule)
        .data(x.ticks())
        .left(x)
        .height(5)
        .bottom(-5)
        .strokeStyle( x_axis_color )
      .anchor("bottom")
        .add(pv.Label)
          .textStyle( x_axis_color )
          .textMargin( 5 )
          .text(function(d){ return d.toFixed(); })
          ;

    if ( display_driver.plot === "line" ) {
      vis.add( pv.Panel )
          .data( data )
          .add( pv.Line )
            .data(function(d){ return d; })
            .left(function(d){ return x(d.x); })
            .bottom(function(d){ return y(d.y); })
            .strokeStyle(function () { return colors[ this.parent.index ]; })
            .lineWidth(2)
            ;
    }
    else if ( display_driver.plot === "bar" ) {
      var active_count = (loans[0].active * 1) + ( loans[1].active * 1);
      var b = pv.Scale.ordinal(pv.range(x_min, x_max+1)).splitBanded(0, w, 5/6);
      vis.add( pv.Panel )
          .data( data )
          .add( pv.Bar )
            .data(function(d){ return d; })
            .left(function(d){
              if ( active_count === 2 ) {
                return b(d.x) + this.parent.index * (b.range().band / 2);
              }
              return b(d.x);
            })
            .height(function(d){
              return y( Math.abs(d.y) ) - y(0);
            })
            .width( b.range().band / active_count )
            .bottom(function(d){
              return ( d.y < 0 ) ? y(d.y) : y(0);
            })
            .fillStyle(function(){ return colors[ this.parent.index ]; })
            ;
    }

    vis.render();

  }

  
  function update_app () {

    // UI
    var display_driver_id = $('#display_driver').val();
    current_driver = display_drivers[ display_driver_id ];

    $( '.context_controls' ).hide();
    if ( current_driver.extra_controls ) {
      $( '#' + current_driver.extra_controls ).show();
    }

    // Plot
    var loan1 = amortize( get_loan_properties( "#loan1" ) );
    $( '#loan1' )
        .css( 'border-color', loan1.active ? colors[0] : '' )
        .toggleClass( 'inactive', !loan1.active )
        ;

    var loan2 = amortize( get_loan_properties( "#loan2" ) );
    $( '#loan2' )
        .css( 'border-color', loan2.active ? colors[1] : '' )
        .toggleClass( 'inactive', !loan2.active )
        ;

    current_data = [ loan1, loan2 ];
    plot( current_data, current_driver );

  }

  $( "#inputform" )
    .on( 'submit', function(e) { e.preventDefault(); })
    .bind( 'change', update_app )
    .bind( 'submit', update_app )
    .bind( 'blur', update_app )
    .bind( 'focusout', update_app )
    ;

  var minWidth = 1160;
  var was_narrow;
  $( window ).bind( 'resize', function (e) {
    var is_narrow = $( window ).width() < minWidth;
    if ( is_narrow != was_narrow ) {
      $( 'body' ).toggleClass( 'narrow', is_narrow );
    }
    was_narrow = is_narrow;
    if ( current_data ) {
      plot( current_data, current_driver )
    }
  }).trigger( 'resize' );

  update_app();

});
