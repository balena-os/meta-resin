/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

'use strict';

module.exports = {
	title: 'Rollback altboot (broken init) test',
	run: async function(test) {
		await this.context.get().hup.initDUT(this, test, this.context.get().link);

		const versionBeforeHup = await this.context
			.get()
			.worker.getOSVersion(this.context.get().link);

		test.comment(`OS version before HUP: ${versionBeforeHup}`);

		await this.context
			.get()
			.hup.doHUP(
				this,
				test,
				'image',
				this.context.get().hup.payload,
				this.context.get().link,
			);

		// there are no timers/counts to change for rollback-altboot, but rollback-health also gets called
		// so we will reduce the timeouts used there as it comes into play
		test.comment(`Reducing timeout for rollback-health...`);
		await this.context
			.get()
			.worker.executeCommandInHostOS(
				`sed -i -e "s/COUNT=.*/COUNT=3/g" -e "s/TIMEOUT=.*/TIMEOUT=20/g" $(find /mnt/sysroot/inactive/ | grep "bin/rollback-health")`,
				this.context.get().link,
			);

		// break init
		test.comment(`Breaking init to trigger rollback-altboot...`);
		await this.context
			.get()
			.worker.executeCommandInHostOS(
				`rm /mnt/sysroot/inactive/current/boot/init`,
				this.context.get().link,
			);

		await this.context.get().worker.rebootDut(this.context.get().link);

		// check every 10s for 5 min since we are expecting multiple reboots
		test.comment(`Waiting for OS version to revert to ${versionBeforeHup}...`);
		await this.context.get().utils.waitUntil(
			async () => {
				return (
					(await this.context
						.get()
						.worker.getOSVersion(this.context.get().link)) === versionBeforeHup
				);
			},
			false,
			30,
			10000,
		);

		// check every 5s for 2min
		// 0 means file exists, 1 means file does not exist
		test.comment(`Waiting for rollback-health-breadcrumb to be cleaned up...`);
		await this.context.get().utils.waitUntil(
			async () => {
				return (
					(await this.context
						.get()
						.worker.executeCommandInHostOS(
							`test -f /mnt/state/rollback-health-breadcrumb ; echo $?`,
							this.context.get().link,
							{ interval: 2000, tries: 3 },
						)) === `1`
				);
			},
			false,
			24,
			5000,
		);

		// 0 means file exists, 1 means file does not exist
		test.is(
			await this.context
				.get()
				.worker.executeCommandInHostOS(
					`test -f /mnt/state/rollback-altboot-triggered ; echo $?`,
					this.context.get().link,
					{ interval: 2000, tries: 3 },
				),
			'0',
			'There should be a rollback-altboot-triggered file in the state partition',
		);
	},
};
