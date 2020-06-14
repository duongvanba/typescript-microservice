export const undefined_filter = (data: any) => {
    let rs = {}
    for (const key in data) data[key] && (rs[key] = rs[key])
    return rs
}