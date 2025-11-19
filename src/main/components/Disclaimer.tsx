import styled from "@emotion/styled"
import {
  Anchor,
  Button,
  darken,
  Space,
  Switch,
  Text,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { Fragment, FunctionComponent, MouseEvent } from "react"
import { useTranslation } from "react-i18next"

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
  const { colorScheme } = useMantineColorScheme()
  const form = useForm({
    initialValues: {
      accept: false,
    },
  })
  return (
    <Fragment>
      <CustomOverlay>
        <CustomInnerOverlay
          color={colorScheme === "dark" ? theme.colors.dark[7] : "#fff"}
        />
      </CustomOverlay>
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
              void window.api.openExternalUrl(
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
              void window.api.openExternalUrl(
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
              props.close()
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
  )
}

export default Disclaimer
