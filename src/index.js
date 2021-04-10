#!/usr/bin/env node

const { Octokit } = require("@octokit/rest");
const got = require("got");

const { createHash } = require("crypto");

const cli = require("caporal");

const { name, version, description, homepage } = require("../package.json");
cli.name(name);
cli.version(version);
cli.description(description);

/**
 * Mirrors a repository.
 * @param {Object} argv The arguments and options to use.
 * @param {Octokit} github The GitHub API wrapper.
 * @param {Got} gitlab The GitLab API wrapper.
 * @param {Logger} log The logger.
 */
async function mirror(argv = {}, github, gitlab, log) {
	const [ owner, repoName ] = argv.repo.split("/");
	if (!owner || owner.length === 0 || !repoName || repoName.length === 0) {
		log.error("invalid repo name: '%s'", argv.repo);
		process.exit(0);
	}

	const repo = await github.repos.get({
		owner,
		repo: repoName,
	});
	log.info("creating mirror for github repository with name '%s': %s", repo.data.full_name, repo.data.html_url);

	const resolvedName = repo.data.name + (argv.hash ? "-" + createHash("md5").update(repo.data.name + Date.now()).digest("hex") : "");
	const visibility = repo.data.private ? "private" : "public";

	const project = await gitlab.post("projects", {
		json: {
			/* eslint-disable camelcase */
			auto_devops_enabled: false,
			container_registry_enabled: false,
			default_branch: repo.data.default_branch,
			description: argv.descriptionPrefix + " " + repo.data.description + " " + argv.descriptionSuffix,
			import_url: repo.data.clone_url,
			issues_enabled: false,
			jobs_enabled: false,
			lfs_enabled: false,
			merge_method: "merge",
			merge_requests_enabled: false,
			namespace_id: argv.namespace,
			packages_enabled: false,
			pages_access_level: "disabled",
			path: resolvedName,
			request_access_enabled: false,
			shared_runners_enabled: false,
			snippets_enabled: false,
			tag_list: repo.data.topics,
			visibility,
			wiki_enabled: false,
			/* eslint-enable camelcase */
		},
	});
	log.info("created gitlab project with id '%s': %s", project.body.id, project.body.web_url);
}

cli.command("mirror", "Mirrors a repository.")
	.argument("<repo>", "The GitHub repository to mirror.")
	.option("--github-auth <auth>", "The authentication token to use for GitHub.", cli.STRING, null, true)
	.option("--gitlab-auth <auth>", "The authentication token to use for GitLab.", cli.STRING, null, true)
	.option("--namespace <namespace>", "The namespace to create the GitLab project under. If not specified, defaults to the authenticated GitLab user.", cli.INTEGER, null, false)
	.option("--description-prefix <description-prefix>", "A prefix to prepend to the description.", cli.STRING, "", false)
	.option("--description-suffix <description-suffix>", "A suffix to append to the description.", cli.STRING, "", false)
	.option("--hash", "Whether to add a hash to the end of the project name.", cli.BOOLEAN, "", false)
	.action((args, options, log) => {
		const argv = Object.assign(args, options);
		log.debug("recieved args: %j", argv);

		const userAgent = `${name} (${version}) - ${homepage}`;

		const github = new Octokit({
			auth: argv.githubAuth,
			previews: [
				"mercy",
			],
			userAgent,
		});
		const gitlab = got.extend({
			headers: {
				"private-token": argv.gitlabAuth,
				"user-agent": userAgent,
			},
			prefixUrl: "https://gitlab.com/api/v4",
			responseType: "json",
		});

		mirror(argv, github, gitlab, log);
	});

cli.parse(process.argv);
