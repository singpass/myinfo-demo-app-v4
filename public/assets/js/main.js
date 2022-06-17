(function($) {
"use strict";

$(window).on('scroll', function(){
  $(".form-link").css("opacity", 1 - $(window).scrollTop() / 250);
});

$('.form-link').on('click', function (e) {
    $('html, body').scrollTo('#form',500);
});


})(jQuery);
