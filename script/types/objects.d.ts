type DnsRecord = {
  type: string;

  value: string;
  ttl?: number;

  proxy?: boolean;

  // Only for MX records.
  priority?: number;
};

type DnsRecords = {
  [name: string]: DnsRecord[];
};

type Config = {
  [domain: string]: DnsRecords;
};
