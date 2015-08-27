#!/usr/bin/env node
var async = require('async');
var path = require('path');
var nodegit = require('nodegit');
var fs = require('fs-extra');
var npm = require('npm');
var exec = require('child_process').exec;

var HOME = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
var TEMPLATE = path.join(HOME, '.tiyfe', 'tiyfe-template');
var GIT = path.join(process.cwd(), '.git');
var hasGit = false;

async.auto({
	// Create directory if it doesn't exit
	mkdir: [function(cb) {
		fs.mkdirp(path.join(HOME, '.tiyfe'), cb);
	}],
	update: ['mkdir', function(cb) {
		try {
			// Query the entry
			var stats = fs.lstatSync(TEMPLATE);
			var respository = null;
			var oldCommit = null;

			// Is it a directory?
			if (stats.isDirectory()) {
				nodegit.Repository.open(TEMPLATE)
				.then(function(repo) {
					repository = repo;
					return repository.getHeadCommit();
				})
				.then(function(commit) {
					oldCommit = commit.sha();

					return repository.fetchAll({
						credentials: function(url, userName) {
							return nodegit.Cred.sshKeyFromAgent(userName);
						},
						certificateCheck: function() {
							return 1;
						}
					});
				})
				// Now that we're finished fetching, go ahead and merge our local branch
				// with the new one
				.then(function() {
					return repository.mergeBranches("master", "origin/master");
				})
				.then(function() {
					return repository.getHeadCommit();
				})
				.done(function(commit) {
					// there was a change, run npm install
					if(oldCommit !== commit.sha()) {
						exec('npm install', {cwd: TEMPLATE}, function(error, stdout, stderr) {
							console.log(stdout);
							console.log(stderr);
							cb();
						});
					}
					else {
						cb();
					}
				});
			}
		}
		catch (e) {
			nodegit.Clone(
				"https://github.com/alarner/tiyfe-template.git",
				TEMPLATE,
				{
					remoteCallbacks: {
						certificateCheck: function() {
							// github will fail cert check on some OSX machines
							// this overrides that check
							return 1;
						}
					}
				}
			)
			.done(function() {
				exec('npm install', {cwd: TEMPLATE}, function(error, stdout, stderr) {
					console.log(stdout);
					console.log(stderr);
					cb();
				});
			});
		}
	}],
	copy: ['update', function(cb) {
		try {
			var stats = fs.lstatSync(GIT);
			hasGit = stats.isDirectory();
		}
		catch(e) {
			hasGit = false;
		}
		fs.copy(TEMPLATE, process.cwd(), {
			clobber: false,
			filter: function(file) {
				return (file.substr(TEMPLATE.length, 6) !== '/.git/');
			}
		}, cb)
	}],
	removeGit: ['copy', function(cb) {
		// Don't delete the git repo if it wasn't one that we created
		if(hasGit) {
			return cb();
		}

		fs.remove(GIT, cb);
	}]
});