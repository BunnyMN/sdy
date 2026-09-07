import { registerDictionary, source } from "../registry";
import { events } from "../addons/events";

registerDictionary("events", source(events));
