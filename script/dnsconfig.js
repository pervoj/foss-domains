// @ts-check
/// <reference path="types/types-dnscontrol.d.ts" />
/// <reference path="types/glob.d.ts" />
/// <reference path="types/objects.d.ts" />

var RECORD_TYPES = ["a", "aaaa", "cname", "mx", "ns", "txt"];

var REG_NONE = NewRegistrar("none");
var DNS_CF = NewDnsProvider("cloudflare");
var DEFAULT_TTL = 1800;

var DOMAINS_DIR = "../domains/";
var RECORDS_FILE = "records.json";

/**
 * Throws an error if [records] is not valid.
 *
 * @param {DnsRecord[]} records
 */
function validateRecords(records) {
  for (var i = 0; i < records.length; i++) {
    var record = records[i];

    if (typeof record != "object") {
      throw new Error(JSON.stringify(record) + " must be an object!");
    }

    if (typeof record["type"] != "string") {
      throw new Error(
        JSON.stringify(record) + ", `type` (string) is required!"
      );
    }

    if (RECORD_TYPES.indexOf(record["type"]) < 0) {
      throw new Error(
        JSON.stringify(record) +
          ", valid values for `type`: " +
          RECORD_TYPES.join(", ")
      );
    }

    if (typeof record["value"] != "string") {
      throw new Error(
        JSON.stringify(record) + ", `value` (string) is required!"
      );
    }

    if (record["type"] == "mx" && typeof record["priority"] != "number") {
      throw new Error(
        JSON.stringify(record) +
          ", `priority` (number) is required for MX records!"
      );
    }

    if (record["ttl"] && typeof record["ttl"] != "number") {
      throw new Error(JSON.stringify(record) + ", `ttl` must be a number!");
    }

    if (record["proxy"] && typeof record["proxy"] != "boolean") {
      throw new Error(JSON.stringify(record) + ", `proxy` must be a boolean!");
    }
  }
}

/**
 * Loads all the configuration files.
 *
 * @returns {Config}
 */
function loadConfig() {
  var files = glob(DOMAINS_DIR, true, ".json");

  /** @type {Config} */
  var domains = {};

  for (var i = 0; i < files.length; i++) {
    var file = /** @type {`${string}.json`} */ (files[i]);

    var basename = file.split("/").reverse()[0];
    if (basename != RECORDS_FILE) continue;

    var parts = file // For example: [ossnet.xyz, my-project, git]
      .replace(DOMAINS_DIR, "")
      .replace("/" + RECORDS_FILE, "")
      .split("/");

    var domain = parts.shift();
    if (!domain) {
      throw new Error("Path of " + file + " doesn't match the right pattern!");
    }

    var subdomain = parts.reverse().join("."); // For example: git.my-project
    if (subdomain == "") subdomain = "@";

    /** @type {DnsRecord[]} */
    var dns = require(file);
    if (!Array.isArray(dns)) {
      throw new Error("Content of " + file + " is not an array!");
    }

    validateRecords(dns);

    if (!domains[domain]) {
      /** @type {DnsRecords} */
      domains[domain] = {};
    }
    domains[domain][subdomain] = dns;
  }

  return domains;
}

var config = loadConfig();
var domains = Object.keys(config); // List of domains in the DOMAINS_DIR.

for (var i = 0; i < domains.length; i++) {
  var domain = domains[i]; // For example: ossnet.xyz

  var recordsConfig = config[domain]; // DNS configuration for the domain.
  var recordsNames = Object.keys(recordsConfig); // The DNS record names.

  var records = []; // The list of records for this domain / zone.

  for (var j = 0; j < recordsNames.length; j++) {
    var recordName = recordsNames[j]; // The current name.
    var recordsForName = recordsConfig[recordName]; // Records with this name.

    for (var k = 0; k < recordsForName.length; k++) {
      var record = recordsForName[k]; // The current record.

      var ttl = TTL(DEFAULT_TTL); // (record.ttl) ? record.ttl : DEFAULT_TTL
      if (record.ttl) ttl = TTL(record.ttl);

      var proxy = CF_PROXY_OFF;
      if (record.proxy) proxy = CF_PROXY_ON;

      // Add record based on the type and the data.
      switch (record.type) {
        case "a":
          records.push(A(recordName, record.value, ttl, proxy));
          break;
        case "aaaa":
          records.push(AAAA(recordName, record.value, ttl, proxy));
          break;
        case "cname":
          records.push(CNAME(recordName, record.value, ttl, proxy));
          break;
        case "mx":
          records.push(
            MX(
              recordName,
              /** @type {number} */ (record.priority),
              record.value,
              ttl
            )
          );
          break;
        case "ns":
          records.push(NS(recordName, record.value, ttl));
          break;
        case "txt":
          records.push(TXT(recordName, record.value, ttl));
          break;
      }
    }
  }

  // Configure the domain with the list of records.
  D(domain, REG_NONE, DnsProvider(DNS_CF), records);
}
