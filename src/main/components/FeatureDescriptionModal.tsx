import {
  ActionIcon,
  MantineSize,
  Modal,
  Text,
  useMantineTheme,
} from "@mantine/core"
import { IconInfoCircle } from "@tabler/icons-react"
import { Fragment, FunctionComponent, ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

type InfoButtonProps = {
  children: ReactNode
  size?: MantineSize
}

const InfoButton: FunctionComponent<InfoButtonProps> = (props) => {
  const { children, size = "xs" } = props

  const { t } = useTranslation()
  const theme = useMantineTheme()
  const [opened, setOpened] = useState(false)

  return (
    <Fragment>
      <ActionIcon
        color="dark"
        onClick={() => setOpened(true)}
        radius="xl"
        size={size}
        sx={{ verticalAlign: "middle" }}
        variant="subtle"
      >
        <IconInfoCircle color={theme.colors.pink[6]} />
      </ActionIcon>
      <Modal
        centered
        onClose={() => setOpened(false)}
        opened={opened}
        title={t("components.featureDescriptionModal.learnMore")}
        styles={{
          title: {
            fontWeight: "bold",
          },
        }}
      >
        <Text size="sm">{children}</Text>
      </Modal>
    </Fragment>
  )
}

export default InfoButton
