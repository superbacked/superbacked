import React, { Fragment, FunctionComponent, MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { styled } from "styled-components"
import {
  Anchor,
  Button,
  Space,
  Switch,
  Text,
  useMantineTheme,
} from "@mantine/core"
import { useForm } from "@mantine/form"

const CustomOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  backdrop-filter: blur(4px);
  z-index: 300;
`

interface CustomInnerOverlayProps {
  color: string
}

const CustomInnerOverlay = styled.div<CustomInnerOverlayProps>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  opacity: 0.85;
  z-index: 300;
  ${(props) => {
    return `background-color: ${props.color}`
  }};
`

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
  z-index: 400;
`

interface DisclaimerProps {
  close: () => void
}

const Disclaimer: FunctionComponent<DisclaimerProps> = (props) => {
  const { t } = useTranslation()
  const theme = useMantineTheme()
  const form = useForm({
    initialValues: {
      accept: false,
    },
  })
  return (
    <Fragment>
      <CustomOverlay>
        <CustomInnerOverlay
          color={theme.colorScheme === "dark" ? theme.colors.dark[7] : "#fff"}
        />
      </CustomOverlay>
      <Container>
        <Text>
          <Text
            gradient={{ from: "#fdc0ee", to: "#fbd6cd", deg: 45 }}
            variant="gradient"
            weight="bold"
            span
          >
            {t("doNot")}
          </Text>{" "}
          {t("useSuperbackedOnComputer")}{" "}
          <Anchor
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              event.preventDefault()
              window.api.openExternalUrl(
                `${process.env.SUPERBACKED_WEBSITE_BASE_URI}/faq/air-gapped`
              )
            }}
          >
            {t("airGapped")}
          </Anchor>{" "}
          {t("and")}{" "}
          <Anchor
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              event.preventDefault()
              window.api.openExternalUrl(
                `${process.env.SUPERBACKED_WEBSITE_BASE_URI}/faq/hardware`
              )
            }}
          >
            {t("exclusivelyUsed")}
          </Anchor>{" "}
          {t("forSecretManagementUnlessSecret")}
        </Text>
        <Space h="lg" />
        <Text>
          {t("superbackedIncCannotBeHeldResponsible")}{" "}
          <Text
            gradient={{ from: "#fdc0ee", to: "#fbd6cd", deg: 45 }}
            variant="gradient"
            weight="bold"
            span
          >
            {t("useAtYourOwnRisk")}
          </Text>
        </Text>
        <Space h="lg" />
        <form>
          <Switch
            checked={form.values.accept}
            label={t("agree")}
            {...form.getInputProps("accept", { withFocus: false })}
          />
          <Space h="lg" />
          <Button
            disabled={!form.values.accept}
            fullWidth
            gradient={{ from: "#fdc0ee", to: "#fbd6cd", deg: 45 }}
            size="md"
            variant="gradient"
            onClick={() => {
              props.close()
            }}
            sx={(theme) => ({
              "&:disabled": {
                color: theme.fn.darken("#fff", 0.25),
                backgroundImage: `linear-gradient(45deg, ${theme.fn.darken(
                  "#fdc0ee",
                  0.25
                )} 0%, ${theme.fn.darken("#fbd6cd", 0.25)} 100%)`,
              },
            })}
          >
            {t("useSuperbacked")}
          </Button>
        </form>
      </Container>
    </Fragment>
  )
}

export default Disclaimer
