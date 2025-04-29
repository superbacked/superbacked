import "react-i18next"

import { resources } from "../i18n"

declare module "react-i18next" {
  interface CustomTypeOptions {
    resources: (typeof resources)["en"]
  }
}
