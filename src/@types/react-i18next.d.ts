import "react-i18next"

import { Translation } from "@/src/shared/types/i18n"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: {
      translation: Translation
    }
  }
}
