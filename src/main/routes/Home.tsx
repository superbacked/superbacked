import styled from "@emotion/styled"
import { Box, Card, Group, Kbd, SimpleGrid, Text } from "@mantine/core"
import { FunctionComponent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"

import ActionBadge from "@/src/main/components/ActionBadge"
import InfoButton from "@/src/main/components/FeatureDescriptionModal"
import FileManager from "@/src/main/components/FileManager"
import {
  routes,
  shortcut,
  shortcutFontFamily,
} from "@/src/main/utilities/routes"

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

// The create card is the one most people open the app for, so it sits
// a shade lighter than its siblings and wears the signature gradient as
// its border — dimmed by mixing each end toward the card surface, so it
// frames rather than shouts. The dark palette steps are wide, so the
// shade is a third of the way to the next step rather than the step
// itself. A 1px gradient border is painted, not drawn: the fill covers
// the padding box and the gradient shows through the transparent border
// around it
const dimmedGradient =
  "linear-gradient(135deg, color-mix(in srgb, var(--mantine-color-gradient-9) 40%, var(--mantine-color-dark-7)) 0%, color-mix(in srgb, var(--mantine-color-gradient-0) 40%, var(--mantine-color-dark-7)) 100%)"

const featuredFill =
  "color-mix(in srgb, var(--mantine-color-dark-7), var(--mantine-color-dark-6) 33%)"

const featuredSurface = `linear-gradient(${featuredFill}, ${featuredFill}) padding-box, ${dimmedGradient} border-box`

const Home: FunctionComponent = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <Container>
      <Box px="xl">
        <FileManager handleFiles={ignoreFiles} mode="standalone" />
        {/* One card per route, two to a row — the four routes fill a
            2 × 2 grid, so the group boundary the menus draw with a
            separator (see src/shared/routes.ts) is not marked here */}
        <SimpleGrid cols={2} spacing="lg">
          {routes.map((route, index) => {
            const featured = route.id === "create"
            return (
              // The website’s feature card (dark-7 surface, 10px radius,
              // 1px border), made pressable — the whole card is the
              // button, so the description is a target too. No hover
              // state, as the website’s cards have none — the focus ring
              // is the one every other control draws
              <Card
                component="button"
                key={route.to}
                onClick={() => {
                  void navigate(route.to)
                }}
                p="xl"
                radius={10}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  background:
                    featured === true
                      ? featuredSurface
                      : "var(--mantine-color-dark-7)",
                  border:
                    featured === true
                      ? "1px solid transparent"
                      : "1px solid var(--sb-border)",
                  textAlign: "left",
                  cursor: "pointer",
                  "&:focus-visible": {
                    outline: "2px solid var(--mantine-primary-color-filled)",
                    outlineOffset: 2,
                  },
                }}
                type="button"
              >
                {/* The shortcut sits top right on the label’s line as a
                    key cap (see the Kbd theme entry in src/main/App.tsx),
                    pairing each route with its accelerator the way the
                    in-window menu does (see
                    src/main/components/NavigationMenu.tsx) */}
                <Group justify="space-between" mb="sm" wrap="nowrap">
                  <Text
                    fw="bold"
                    size="md"
                    style={{
                      backgroundImage: gradientSlice(index, routes.length),
                    }}
                    variant="signatureGradient"
                  >
                    {t(route.labelKey)}
                  </Text>
                  <Kbd ff={shortcutFontFamily} size="sm">
                    {shortcut(route.shortcutKey)}
                  </Kbd>
                </Group>
                <Text c="dimmed" size="sm">
                  {t(route.descriptionKey)}
                </Text>
              </Card>
            )
          })}
        </SimpleGrid>
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
