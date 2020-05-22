const gulp = require('gulp');
const clean = require('gulp-clean');
const zip = require('gulp-zip');
const merge = require('merge-stream');

gulp.task('clean', () => {
    const nodeModules = gulp.src('./src/node_modules', { allowEmpty: true, read: false} ).pipe(clean());
    const target = gulp.src('target', { allowEmpty: true, read: false} ).pipe(clean());

    return merge(nodeModules, target);
})

gulp.task('build', () => {
  const nodeModules = gulp.src('./src/node_modules/**/*').pipe(gulp.dest('./target/node_modules'));
  const lambdaFunction = gulp.src('./src/alexa-skill-lambda.js').pipe(gulp.dest('./target'));
  const responseBuilder = gulp.src('./src/alexa-model.js').pipe(gulp.dest('./target'));

  return merge(nodeModules, lambdaFunction, responseBuilder);
});

gulp.task('package', gulp.series('build', () =>
    gulp.src('./target/**/*')
        .pipe(zip('alexa-skill-lambda.zip'))
        .pipe(gulp.dest('./target'))));
