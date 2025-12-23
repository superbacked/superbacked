import styled from "@emotion/styled"
import {
  Anchor,
  Button,
  Overlay,
  Space,
  Switch,
  Text,
  darken,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { Fragment, FunctionComponent, MouseEvent, useState } from "react"
import { useTranslation } from "react-i18next"

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

const Disclaimer: FunctionComponent = () => {
  const { t } = useTranslation()
  const theme = useMantineTheme()
  const { colorScheme } = useMantineColorScheme()
  const [show, setShow] = useState(true)
  const form = useForm({
    initialValues: {
      accept: false,
    },
  })
  return show === true ? (
    <Fragment>
      <Overlay
        backgroundOpacity={0.85}
        blur={4}
        color={colorScheme === "dark" ? theme.colors.dark[7] : "#fff"}
        zIndex={300}
      />
      <Container>
        <Text>
          <Text
            fw="bold"
            gradient={{ from: "#fdc0ee", to: "#fbd6cd", deg: 45 }}
            variant="gradient"
            span
          >
            {t("components.disclaimer.doNot")}
          </Text>{" "}
          {t("components.disclaimer.useSuperbackedOnComputer")}{" "}
          <Anchor
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              event.preventDefault()
              void window.api.invoke.openExternalUrl(
                `${process.env.SUPERBACKED_WEBSITE_BASE_URI}/faq/air-gapped`
              )
            }}
          >
            {t("components.disclaimer.airGapped")}
          </Anchor>{" "}
          {t("components.disclaimer.and")}{" "}
          <Anchor
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              event.preventDefault()
              void window.api.invoke.openExternalUrl(
                `${process.env.SUPERBACKED_WEBSITE_BASE_URI}/faq/hardware`
              )
            }}
          >
            {t("components.disclaimer.exclusivelyUsed")}
          </Anchor>{" "}
          {t("components.disclaimer.forSecretManagementUnlessSecret")}
        </Text>
        <Space h="lg" />
        <Text>
          {t("components.disclaimer.superbackedIncCannotBeHeldResponsible")}{" "}
          <Text
            fw="bold"
            gradient={{ from: "#fdc0ee", to: "#fbd6cd", deg: 45 }}
            variant="gradient"
            span
          >
            {t("components.disclaimer.useAtYourOwnRisk")}
          </Text>
        </Text>
        <Space h="lg" />
        <form>
          <Switch
            checked={form.values.accept}
            label={t("components.disclaimer.agree")}
            withThumbIndicator={false}
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
              setShow(false)
            }}
            sx={{
              "&:disabled": {
                color: darken("#fff", 0.25),
                backgroundImage: `linear-gradient(45deg, ${darken(
                  "#fdc0ee",
                  0.25
                )} 0%, ${darken("#fbd6cd", 0.25)} 100%)`,
              },
            }}
          >
            {t("components.disclaimer.useSuperbacked")}
          </Button>
        </form>
      </Container>
    </Fragment>
  ) : null
}

export default Disclaimer
