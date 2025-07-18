import toast from 'react-hot-toast';

export async function copyURL({
    success_msg, error_msg
}: {success_msg: string, error_msg: string}) {
    try {
        // Use clipboard.writeText directly instead of trying to create
        // a ClipboardItem. For some reason Firefox does not recognize the
        // Clipboarditem reference and throws an error.
        await navigator.clipboard.writeText(window.location.href);
        toast.success(success_msg);
    } catch (err) {
        toast.error(error_msg);
        throw err;
    }
}
