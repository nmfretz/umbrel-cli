import path from "node:path";
import YAML from "yaml";
import umbrelAppStoreYmlSchema from "../schemas/umbrel-app-store.yml.schema";
import { mockVariables } from "./mock";
import { ComposeSpecification } from "../schemas/docker-compose.yml.schema";
import Ajv from "ajv";
import { DefinedError } from "ajv";
import addFormats from "ajv-formats";
import dockerComposeYmlSchema from "../schemas/docker-compose.yml.schema.json";
import umbrelAppYmlSchema from "../schemas/umbrel-app.yml.schema";
import { ZodIssueCode } from "zod";
import { getSourceMapForKey } from "../utils/yaml";

export interface LintingResult {
  id:
    | ZodIssueCode
    | DefinedError["keyword"]
    | "invalid_yaml_syntax"
    | "invalid_docker_image_name"
    | "invalid_yaml_boolean_value"
    | "invalid_app_data_dir_volume_mount"
    | "invalid_submission_field"
    | "missing_file_or_directory";
  propertiesPath?: string;
  line?: { start: number; end: number }; // Starting at 1
  column?: { start: number; end: number }; // Starting at 1
  severity: "error" | "warning" | "info";
  title: string;
  message: string;
}

export async function lintUmbrelAppStoreYml(
  content: string
): Promise<LintingResult[]> {
  // check if the file is valid yaml
  let umbrelAppStoreYml;
  try {
    umbrelAppStoreYml = YAML.parse(content);
  } catch (e) {
    return [
      {
        id: "invalid_yaml_syntax",
        severity: "error",
        title: "umbrel-app-store.yml is not a valid YAML file",
        message: String(e),
      },
    ];
  }

  // zod parse the file
  const schema = await umbrelAppStoreYmlSchema();
  const result = await schema.safeParseAsync(umbrelAppStoreYml);
  if (!result.success) {
    return result.error.issues.map(
      (issue) =>
        ({
          id: issue.code,
          propertiesPath: issue.path.join("."),
          ...getSourceMapForKey(content, issue.path),
          severity: "error",
          title: issue.path.join("."),
          message: issue.message,
        }) satisfies LintingResult
    );
  }
  return [];
}

export interface LintUmbrelAppYmlOptions {
  isNewAppSubmission?: boolean;
  pullRequestUrl?: string;
}

export async function lintUmbrelAppYml(
  content: string,
  options: LintUmbrelAppYmlOptions = {}
): Promise<LintingResult[]> {
  // check if the file is valid yaml
  let rawUmbrelAppYml;
  try {
    rawUmbrelAppYml = YAML.parse(content);
  } catch (e) {
    return [
      {
        id: "invalid_yaml_syntax",
        severity: "error",
        title: "umbrel-app.yml is not a valid YAML file",
        message: String(e),
      },
    ];
  }

  // zod parse the file
  const schema = await umbrelAppYmlSchema();
  const result = await schema.safeParseAsync(rawUmbrelAppYml);
  if (!result.success) {
    return result.error.issues.map(
      (issue) =>
        ({
          id: issue.code,
          propertiesPath: issue.path.join("."),
          ...getSourceMapForKey(content, issue.path),
          severity: "error",
          title: issue.path.join("."),
          message: issue.message,
        }) satisfies LintingResult
    );
  }
  const umbrelAppYml = result.data;

  // If this is being called by another program in library mode (like a GitHub Action)
  // and this is a new app submission, check if the submission field corresponds to the pull request URL
  if (
    options.isNewAppSubmission &&
    options.pullRequestUrl &&
    umbrelAppYml.submission !== options.pullRequestUrl
  ) {
    return [
      {
        id: "invalid_submission_field",
        severity: "error",
        title: `Invalid submission field "${umbrelAppYml.submission}"`,
        message: `The submission field must be set to the URL of this pull request: ${options.pullRequestUrl}`,
      },
    ];
  }

  return [];
}

export async function lintDockerComposeYml(
  content: string,
  files: string[],
  id: string
): Promise<LintingResult[]> {
  // Mock the variables
  const rawDockerComposeYmlMocked = await mockVariables(content);

  // check if the file is valid yaml
  let dockerComposeYmlMocked: ComposeSpecification;
  try {
    dockerComposeYmlMocked = YAML.parse(rawDockerComposeYmlMocked, {
      merge: true,
    });
  } catch (e) {
    return [
      {
        id: "invalid_yaml_syntax",
        severity: "error",
        title: "docker-compose.yml is not a valid YAML file",
        message: String(e),
      },
    ];
  }

  // Check if the file is a valid docker compose file
  const ajv = new Ajv({ allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile<ComposeSpecification>(dockerComposeYmlSchema);
  const validAppYaml = validate(dockerComposeYmlMocked);
  if (!validAppYaml) {
    return ((validate.errors as DefinedError[]) ?? []).map(
      (error) =>
        ({
          id: error.keyword,
          propertiesPath: path
            .normalize(error.instancePath)
            .split(path.sep)
            .filter(Boolean)
            .join("."),
          ...getSourceMapForKey(
            content,
            path.normalize(error.instancePath).split(path.sep).filter(Boolean)
          ),
          severity: "error",
          title: error.instancePath,
          message: error.message ?? "Unknown error",
        }) satisfies LintingResult
    );
  }

  const result: LintingResult[] = [];
  const servicesMocked = Object.keys(dockerComposeYmlMocked.services ?? {});

  // Check if the image follows the naming convention
  for (const service of servicesMocked) {
    const image = dockerComposeYmlMocked.services?.[service].image;
    if (!image) {
      continue;
    }
    const imageMatch = image.match(/^(.+):(.+)@(.+)$/);
    if (!imageMatch) {
      result.push({
        id: "invalid_docker_image_name",
        propertiesPath: `services.${service}.image`,
        ...getSourceMapForKey(content, ["services", service, "image"]),
        severity: "error",
        title: `Invalid image name "${image}"`,
        message: `Images should be named like "<name>:<version-tag>@<sha256>"`,
      });
    } else {
      const [, version] = imageMatch.slice(1);
      if (version === "latest") {
        result.push({
          id: "invalid_docker_image_name",
          propertiesPath: `services.${service}.image`,
          ...getSourceMapForKey(content, ["services", service, "image"]),
          severity: "warning",
          title: `Invalid image tag "${version}"`,
          message: `Images should not use the "latest" tag`,
        });
      }
    }
  }

  // Check if the keys "environment", "labels", and "extra_hosts" contains bare booleans (true instead of "true")
  // Note this is only an issue in Docker Compose V1. As soon as umbrelOS 0.5 is no longer supported, this check
  // is unnecessary as umbrelOS >= 1 uses Docker Compose V2 which allows bare boolean values
  for (const service of servicesMocked) {
    const environment = dockerComposeYmlMocked.services?.[service].environment;
    const labels = dockerComposeYmlMocked.services?.[service].labels;
    const extra_hosts = dockerComposeYmlMocked.services?.[service].extra_hosts;
    const properties = [];
    // Nothing to do if it is an string array
    if (environment && typeof environment === "object") {
      properties.push({
        label: "environment",
        entries: Object.entries(environment),
      });
    }
    if (labels && typeof labels === "object") {
      properties.push({ label: "labels", entries: Object.entries(labels) });
    }
    if (extra_hosts && typeof extra_hosts === "object") {
      properties.push({
        label: "extra_hosts",
        entries: Object.entries(extra_hosts),
      });
    }

    for (const property of properties) {
      for (const [key, value] of property.entries) {
        if (typeof value === "boolean") {
          result.push({
            id: "invalid_yaml_boolean_value",
            propertiesPath: `services.${service}.${property.label}.${key}`,
            ...getSourceMapForKey(content, [
              "services",
              service,
              property.label,
              key,
            ]),
            severity: "error",
            title: `Invalid YAML boolean value for key "${key}"`,
            message: `Boolean values thould be strings like "${value}" instead of ${value}`,
          });
        }
      }
    }
  }

  // Check if this app puts data directly into the ${APP_DATA_DIR} directory
  // If so, print a warning, because this is not future proof. If the submitter wants to add something
  // later, there is no clear distinction like when using directories.
  let dockerComposeYml;
  try {
    dockerComposeYml = YAML.parse(content, {
      merge: true,
    });
  } catch (e) {
    // This should never happen, as we already parsed the file before
    // But better be safe
    return [
      {
        id: "invalid_yaml_syntax",
        severity: "error",
        title: "docker-compose.yml is not a valid YAML file",
        message: String(e),
      },
    ];
  }
  const services = Object.keys(dockerComposeYml.services ?? {});
  for (const service of services) {
    const volumes = dockerComposeYml.services?.[service]?.volumes;
    // if the volumes is an array
    if (volumes && Array.isArray(volumes)) {
      for (const volume of volumes) {
        if (typeof volume === "string") {
          if (volume.match(/\$\{?APP_DATA_DIR\}?\/?:/)) {
            result.push({
              id: "invalid_app_data_dir_volume_mount",
              propertiesPath: `services.${service}.volumes`,
              ...getSourceMapForKey(content, ["services", service, "volumes"]),
              severity: "warning",
              title: `Volume "${volume}"`,
              message: `Volumes should not be mounted directly into the "\${APP_DATA_DIR}" directory! Please use a subdirectory like "\${APP_DATA_DIR}/data${volume.split(":")[1] ?? ""}" instead.`,
            });
          }
        } else if (
          typeof volume === "object" &&
          "source" in volume &&
          "target" in volume
        ) {
          if (volume.source.match(/\$\{?APP_DATA_DIR\}?\/?$/)) {
            result.push({
              id: "invalid_app_data_dir_volume_mount",
              propertiesPath: `services.${service}.volumes`,
              ...getSourceMapForKey(content, ["services", service, "volumes"]),
              severity: "warning",
              title: `Volume "${volume.source}:${volume.target}"`,
              message: `Volumes should not be mounted directly into the "\${APP_DATA_DIR}" directory! Please use a subdirectory like "source: \${APP_DATA_DIR}/data" and "target: ${volume.target ?? "/some/dir"}" instead.`,
            });
          }
        }
      }
    }
  }

  // Check if all bind mounts, that are like this "${APP_DATA_DIR}/some/dir:/some/dir" are present
  for (const service of services) {
    const volumes = dockerComposeYml.services?.[service]?.volumes;
    // if the volumes is an array
    if (volumes && Array.isArray(volumes)) {
      for (const volume of volumes) {
        if (typeof volume === "string") {
          if (volume.match(/\$\{?APP_DATA_DIR\}?/)) {
            const match = volume.match(/\$\{?APP_DATA_DIR\}?\/?(.*?):/)?.[1];
            if (!match) {
              continue;
            }
            if (!files.includes(`${id}/${match}`)) {
              result.push({
                id: "missing_file_or_directory",
                propertiesPath: `services.${service}.volumes`,
                ...getSourceMapForKey(content, [
                  "services",
                  service,
                  "volumes",
                ]),
                severity: "error",
                title: `Missing file/directory "${id}/${match}"`,
                message: `The volume "${volume}" tries to mount the file/directory "${id}/${match}", but it is not present! Please create that file/directory!`,
              });
            }
          }
        } else if (
          typeof volume === "object" &&
          "source" in volume &&
          "target" in volume
        ) {
          if (volume.source.match(/\$\{?APP_DATA_DIR\}?/)) {
            const match = volume.source.match(
              /\$\{?APP_DATA_DIR\}?\/?(.*?)$/
            )?.[1];
            if (!match) {
              continue;
            }
            if (!files.includes(`${id}/${match}`)) {
              result.push({
                id: "missing_file_or_directory",
                propertiesPath: `services.${service}.volumes`,
                ...getSourceMapForKey(content, [
                  "services",
                  service,
                  "volumes",
                ]),
                severity: "error",
                title: `Missing file/directory "${id}/${match}"`,
                message: `The volume "${volume.source}:${volume.target}" tries to mount the file/directory "${id}/${match}", but it is not present! Please create that file/directory!`,
              });
            }
          }
        }
      }
    }
  }

  return result;
}
