import { ActionIcon, MantineSize, Modal, Text } from "@mantine/core"
import { IconInfoCircle } from "@tabler/icons-react"
import { Fragment, FunctionComponent, ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

type InfoButtonProps = {
  children: ReactNode
  size?: MantineSize
  tabIndex?: number
}

const InfoButton: FunctionComponent<InfoButtonProps> = (props) => {
  const { children, size = "xs", tabIndex } = props

  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)

  return (
    <Fragment>
      <ActionIcon
        color="dark"
        onClick={() => setOpened(true)}
        radius="xl"
        size={size}
        sx={{ verticalAlign: "middle" }}
        tabIndex={tabIndex}
        variant="subtle"
      >
        <IconInfoCircle />
      </ActionIcon>
      <Modal
        centered
        onClose={() => setOpened(false)}
        opened={opened}
        title={t("components.featureDescriptionModal.learnMore")}
      >
        <Text size="sm">{children}</Text>
      </Modal>
    </Fragment>
  )
}

export default InfoButton
