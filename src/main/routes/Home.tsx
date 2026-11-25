import styled from "@emotion/styled"
import { Box, Button, Stack, Text } from "@mantine/core"
import { FunctionComponent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"

import ActionBadge from "@/src/main/components/ActionBadge"
import InfoButton from "@/src/main/components/FeatureDescriptionModal"
import FileManager from "@/src/main/components/FileManager"
import { routes, startsGroup } from "@/src/main/utilities/routes"

// The view the app opens on — one entry per route the File menu offers,
// so the routes that used to live only in the menu are visible in the
// window, plus the standalone archive affordance, which has no route of
// its own

// Same frame and width as the create route’s setup step — every route
// centers its content vertically in the window
const Container = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100vw;
  height: 100vh;
  padding: 40px;
  z-index: 0;
`

// The standalone archive handling is self-contained in the file manager
// (its overlay and modals) — the files it reports are not needed here
const ignoreFiles = () => {
  // Nothing to track
}

// The signature gradient runs between two colors only (see --sb-gradient
// in src/main/App.tsx), so the color at any point along it is a mix of
// its ends — each title paints the slice of the range its position in
// the list covers, and the titles stacked read as the signature gradient
// flowing down the list. Continuous in list order rather than in pixels
// (descriptions and gaps are skipped), and top to bottom rather than
// diagonal, so the flow across rows is true
const gradientSlice = (index: number, count: number) => {
  const stop = (position: number) => {
    const percentage = Math.round((position / count) * 100)
    return `color-mix(in srgb, var(--mantine-color-gradient-9), var(--mantine-color-gradient-0) ${percentage}%)`
  }
  return `linear-gradient(180deg, ${stop(index)} 0%, ${stop(index + 1)} 100%)`
}

const Home: FunctionComponent = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <Container>
      <Box px="xl">
        <FileManager handleFiles={ignoreFiles} mode="standalone" />
        <Stack gap="lg">
          {routes.map((route, index) => {
            return (
              // A standard button with a description line under it — the
              // pairing the create route’s setup step uses for its backup
              // type select. Where a group starts, the lg gap widens to
              // xl — the grouping the menus draw with a separator (see
              // src/shared/routes.ts), in whitespace rather than a line
              <Box
                key={route.to}
                mt={startsGroup(index) === true ? "sm" : undefined}
              >
                <Button
                  fullWidth
                  onClick={() => {
                    void navigate(route.to)
                  }}
                  size="sm"
                  variant="default"
                >
                  <Text
                    fw="bold"
                    size="sm"
                    span
                    style={{
                      backgroundImage: gradientSlice(index, routes.length),
                    }}
                    variant="signatureGradient"
                  >
                    {t(route.labelKey)}
                  </Text>
                </Button>
                <Text mt="xs" size="sm">
                  {t(route.descriptionKey)}
                </Text>
              </Box>
            )
          })}
        </Stack>
      </Box>
      {/* Discovery hint for the one feature without a route — the drop
          target is the whole window */}
      <ActionBadge>
        {t("routes.home.dragAndDropFileToCreateOrRestoreStandaloneArchive")}{" "}
        <InfoButton tabIndex={-1}>
          {t("components.featureDescriptionModal.standaloneArchiveDescription")}
        </InfoButton>
      </ActionBadge>
    </Container>
  )
}

export default Home
