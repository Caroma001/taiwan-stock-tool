import packageJson from "../../package.json";

export const PROJECT_VERSION = packageJson.version;
export const PROJECT_RELEASE = `M${PROJECT_VERSION}`;
export const PROJECT_NAME = `twstock-${PROJECT_RELEASE}`;
