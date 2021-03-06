/*!
 * Copyright (c) Microsoft. All rights reserved.
 * Licensed under the MIT license. See LICENSE file in the project.
 */
import { SpawnOptions, ChildProcess } from 'child_process'
import * as log from './log'
import * as debug from 'debug'

/* eslint-disable-next-line @typescript-eslint/no-var-requires */
const spawn = require('cross-spawn')
const debugLog = debug('essex::jobs')

export interface RunResult {
	output?: string
	error?: string
	code: number
}

/**
 * Runs the given executable with the given args
 * @param exec The executable
 * @param args The args to the executable
 * @param toConsole If the output should be written to the console
 */
export function run(
	exec: string,
	args: unknown[],
	toConsole = true,
): Promise<RunResult> {
	const options = {
		cwd: process.cwd(),
	} as SpawnOptions
	if (toConsole) {
		options.stdio = 'inherit'
	}
	if (exec === 'yarn') {
		const newEnv = { ...process.env }
		Object.keys(newEnv).forEach(name => {
			if (name.startsWith('npm_')) {
				delete newEnv[name]
			}
		})
		options.env = newEnv
	}

	const spawned = spawn(exec, args, options) as ChildProcess
	let output = ''
	let error = ''
	if (!toConsole) {
		if (spawned && spawned.stdout && spawned.stderr) {
			spawned.stdout.on('data', data => (output += data.toString()))
			spawned.stderr.on('data', data => (error += data.toString()))
		}
	}

	return new Promise<RunResult>(resolve => {
		spawned.on('close', code => {
			if (exec === 'eslint' && code === 2) {
				code = 0
			}
			resolve({
				output,
				error,
				code,
			})
		})
	})
}

export interface RunArg {
	exec: string
	id?: string
	args: unknown[]
}

function printJob(job: RunArg): void {
	const message = `executing: [${job.exec} ${job.args.join(' ')}]`
	debugLog(message)
}

async function executeJob(job: RunArg): Promise<number> {
	const { exec, id, args } = job
	let code = 0
	const result = await run(exec, args)
	const subCode = result.code
	printJob(job)
	if (subCode > 0) {
		code = 1
		log.subtaskFail(`${exec}${id ? `[${id}]` : ''} failed`)
	} else {
		log.subtaskSuccess(`${exec}${id ? `[${id}]` : ''} passed`)
	}
	return code
}

export async function runParallel(...jobs: RunArg[]): Promise<number> {
	debugLog('--running parallel jobs--')
	for (const job of jobs) {
		printJob(job)
	}
	debugLog('-------------------------')
	const results = await Promise.all(jobs.map(job => executeJob(job)))
	return Math.max(...results)
}

/**
 * Runs the set of executables in a sequential order
 * @param runs The executables to run
 */
export async function runSequential(
	jobs: Array<RunArg | RunArg[]> = [],
): Promise<number> {
	let code = 0
	for (const job of jobs) {
		code = await (Array.isArray(job) ? runParallel(...job) : executeJob(job))
		if (code !== 0) {
			break
		}
	}
	return code
}
