import { Button, Group } from "@mantine/core"
import { NotificationData, notifications } from "@mantine/notifications"

interface NotificationWithButtonData extends NotificationData {
  buttonLabel: string
  buttonOnClick: () => void
}

export const showNotificationWithButton = ({
  buttonLabel,
  buttonOnClick,
  ...notificationData
}: NotificationWithButtonData) => {
  notifications.show({
    ...notificationData,
    message: (
      <Group gap="xs" justify="space-between">
        {notificationData.message}
        <Button
          color="gray"
          onClick={buttonOnClick}
          size="compact-sm"
          variant="transparent"
        >
          {buttonLabel}
        </Button>
      </Group>
    ),
  })
}
