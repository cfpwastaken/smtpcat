type ConfigValue = string | number | boolean

export default function getConfig<T extends ConfigValue>(key: string, defaultValue?: T): T {
	let value: ConfigValue | undefined = undefined
	let error: string | undefined = undefined
	
	value = value ?? getEnvVar(key) ?? defaultValue
	//console.log("config:", key, value)
	if (value != undefined) {
		if (defaultValue != undefined && typeof value != typeof defaultValue) {
			throw new Error(`Config type of ${key} does not match default value (${typeof defaultValue}).`)
		}
		return value as T
	}

	throw new Error(error) || new Error("Config key " + key + " not found")
}

function getEnvVar(key: string): ConfigValue | undefined {
	const value = Deno.env.get(key) ?? Deno.env.get(key.replaceAll(".", "_"))
	if (!value) return

	return parseStringValue(value)
}

function parseStringValue(value: string): ConfigValue {
	// boolean
	if (value == "true") return true
	else if (value == "false") return false
	// number
	else if (!isNaN(Number(value))) return Number(value)
	// string
	return value
}
