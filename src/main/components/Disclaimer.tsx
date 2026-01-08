import styled from "@emotion/styled"
import { Box, Button, Space, Switch, Text } from "@mantine/core"
import { useForm } from "@mantine/form"
import { Fragment, FunctionComponent, useState } from "react"
import { Trans, useTranslation } from "react-i18next"

import Overlay from "@/src/main/components/Overlay"

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
  const [show, setShow] = useState(true)
  const form = useForm({
    initialValues: {
      accept: false,
    },
  })
  return show === true ? (
    <Fragment>
      <Overlay zIndex={300} />
      <Container>
        <Box px="xl">
          <Text>
            <Trans
              i18nKey="components.disclaimer.computerProvisioningWarning"
              components={{
                bold: <Text fw="bold" variant="signatureGradient" span />,
              }}
            />
          </Text>
          <Space h="lg" />
          <Text>
            {t("components.disclaimer.limitationOfLiability")}{" "}
            <Text fw="bold" variant="signatureGradient" span>
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
              size="md"
              variant="signatureGradient"
              onClick={() => {
                setShow(false)
              }}
            >
              {t("components.disclaimer.useSuperbacked")}
            </Button>
          </form>
        </Box>
      </Container>
    </Fragment>
  ) : null
}

export default Disclaimer
