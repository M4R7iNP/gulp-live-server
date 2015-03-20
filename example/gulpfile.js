var gulp = require('gulp');
var Gls = require('../index.js');

gulp.task('static', function() {
    var server = Gls.static('static', 8888);
    server.start();
    gulp.watch(['static/**/*.css', 'static/**/*.html'], server.notify);
    gulp.watch(['static/**/*.html'], server.stop);
});

gulp.task('normal', function() {
    var server = Gls.new('server.js');
    server.start();
    gulp.watch(['static/**/*.css', 'static/**/*.html'], server.notify);
    gulp.watch('server.js', server.start);
});

gulp.task('custom', function() {
    var server = new Gls(['server.js', '--harmony'], {noColor: true});
    server.start();
    gulp.watch(['static/**/*.css', 'static/**/*.html'], server.notify);
    gulp.watch('server.js', server.start);
});
