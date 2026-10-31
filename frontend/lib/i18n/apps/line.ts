/*
 * Gerege Nexus
 * Copyright (c) 2026 Gerege Systems Development Team, Gerege Nomadica Foundation
 * Distributed under the Apache 2.0 License.
 */

import { line } from "../addons/line";
import { registerDictionary, source } from "../registry";

// The device lines' screens (app/line/**). Registered with the apps rather than
// by the screens themselves, so the dictionary exists before an optional
// language arrives — registerDictionary replaces, and a late registration
// would take that language's overlay away again.
registerDictionary("line", source(line));
