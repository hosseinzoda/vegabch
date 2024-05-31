#!/usr/bin/env -S node --no-warnings=ExperimentalWarning
import {execute, settings} from '@oclif/core'

settings.performanceEnabled = true;
await execute({dir: import.meta.url})
